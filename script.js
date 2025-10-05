class CommunicationManager {
    constructor() {
        this.isProcessing = false;
        this.isStopping = false;
        this.activeTokens = new Set();
        this.completedTokens = new Set();
        this.allTokens = new Set();
        
        this.initializeEventListeners();
        this.updateTokenCounters();
    }

    initializeEventListeners() {
        // File upload handlers
        document.getElementById('fileUploadArea').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (event) => {
            const file = event.target.files[0];
            document.getElementById('fileName').textContent = file ? file.name : 'No file selected';
        });

        // Icon upload handlers
        document.getElementById('iconUploadArea').addEventListener('click', () => {
            document.getElementById('iconInput').click();
        });

        document.getElementById('iconInput').addEventListener('change', (event) => {
            const file = event.target.files[0];
            document.getElementById('iconFileName').textContent = file ? file.name : 'No icon selected';
        });

        // Button event handlers
        document.getElementById('startProcess').addEventListener('click', () => {
            this.startProcessing();
        });

        document.getElementById('stopProcess').addEventListener('click', () => {
            this.stopProcessing();
        });
    }

    async startProcessing() {
        if (this.isProcessing) return;

        const tokens = this.getTokens();
        if (tokens.length === 0) {
            this.addLog('No authentication tokens provided', 'error');
            return;
        }

        this.isProcessing = true;
        this.isStopping = false;
        this.activeTokens.clear();
        this.completedTokens.clear();
        this.allTokens = new Set(tokens);
        
        this.updateTokenCounters();
        this.updateButtonStates();
        this.addLog('Starting process...', 'info');

        try {
            const fileData = await this.prepareFileData();
            const iconData = await this.prepareIconData();
            const targetUsers = this.getTargetUsers();
            const options = this.getOptions();

            // Process tokens in parallel
            const promises = tokens.map(token => 
                this.processSingleToken(token, fileData, iconData, targetUsers, options)
            );

            await Promise.allSettled(promises);
            
            if (!this.isStopping) {
                this.addLog('All processes completed successfully', 'success');
            }
        } catch (error) {
            this.addLog(`Process error: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            this.updateButtonStates();
        }
    }

    stopProcessing() {
        if (!this.isProcessing) return;
        
        this.isStopping = true;
        this.isProcessing = false;
        this.activeTokens.clear();
        this.updateButtonStates();
        this.addLog('Process stopped by user', 'warning');
    }

    async processSingleToken(token, fileData, iconData, targetUsers, options) {
        if (this.isStopping) return;

        const tokenId = this.hashToken(token);
        this.activeTokens.add(tokenId);
        this.updateTokenCounters();

        try {
            this.addLog(`Validating token...`, 'info', tokenId);
            
            const isValid = await this.validateToken(token);
            if (!isValid) {
                this.addLog('Invalid token', 'error', tokenId);
                return;
            }

            if (this.isStopping) return;

            // Create group communications
            await this.createCommunicationGroups(token, fileData, iconData, targetUsers, options, tokenId);
            
            // Send direct messages
            if (options.sendDirectMessages) {
                await this.sendDirectMessages(token, fileData, targetUsers, options, tokenId);
            }

            this.completedTokens.add(tokenId);
            this.addLog('Process completed', 'success', tokenId);

        } catch (error) {
            this.addLog(`Process failed: ${error.message}`, 'error', tokenId);
        } finally {
            this.activeTokens.delete(tokenId);
            this.updateTokenCounters();
        }
    }

    async createCommunicationGroups(token, fileData, iconData, targetUsers, options, tokenId) {
        let successCount = 0;
        let attemptCount = 0;
        const maxAttempts = 50;

        while (attemptCount < maxAttempts && !this.isStopping) {
            attemptCount++;
            
            try {
                const friends = await this.fetchUserRelationships(token, tokenId);
                const recipientIds = this.selectRecipients(friends, targetUsers);
                
                if (recipientIds.length === 0) {
                    this.addLog('No target users found', 'warning', tokenId);
                    break;
                }

                const channel = await this.createGroupChannel(token, recipientIds, tokenId);
                if (!channel) continue;

                // Configure group settings
                await this.configureGroupChannel(token, channel.id, iconData, tokenId);
                
                // Send file
                await this.sendChannelMessage(token, channel.id, fileData, tokenId);
                
                // Exit group if configured
                if (options.autoExitGroups) {
                    await this.exitGroupChannel(token, channel.id, tokenId);
                }

                successCount++;
                this.addLog(`Group created successfully (${successCount})`, 'success', tokenId);

                // Rate limiting delay
                await this.delay(2000 + Math.random() * 3000);

            } catch (error) {
                this.addLog(`Group creation failed: ${error.message}`, 'error', tokenId);
                await this.delay(5000);
            }
        }
    }

    async sendDirectMessages(token, fileData, targetUsers, options, tokenId) {
        try {
            const channels = await this.fetchDirectMessageChannels(token, tokenId);
            const targetChannels = this.filterTargetChannels(channels, targetUsers);
            
            this.addLog(`Found ${targetChannels.length} DM channels`, 'info', tokenId);

            for (const channel of targetChannels) {
                if (this.isStopping) break;
                
                try {
                    await this.sendChannelMessage(token, channel.id, fileData, tokenId);
                    await this.delay(1000 + Math.random() * 2000);
                } catch (error) {
                    this.addLog(`DM send failed: ${error.message}`, 'error', tokenId);
                }
            }
        } catch (error) {
            this.addLog(`DM fetch failed: ${error.message}`, 'error', tokenId);
        }
    }

    // API communication methods
    async validateToken(token) {
        const response = await this.apiRequest('https://discord.com/api/v9/users/@me', {
            headers: { 'Authorization': token }
        });
        return response.status < 300;
    }

    async fetchUserRelationships(token, tokenId) {
        const response = await this.apiRequest('https://discord.com/api/v9/users/@me/relationships', {
            headers: { 'Authorization': token }
        }, tokenId);
        return response.data || [];
    }

    async createGroupChannel(token, recipients, tokenId) {
        const response = await this.apiRequest('https://discord.com/api/v9/users/@me/channels', {
            method: 'POST',
            headers: { 
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recipients })
        }, tokenId);
        
        return response.data;
    }

    async configureGroupChannel(token, channelId, iconData, tokenId) {
        const groupData = {
            name: `group-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        };
        
        if (iconData) {
            groupData.icon = iconData;
        }

        await this.apiRequest(`https://discord.com/api/v9/channels/${channelId}`, {
            method: 'PATCH',
            headers: { 
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(groupData)
        }, tokenId);
    }

    async sendChannelMessage(token, channelId, fileData, tokenId) {
        if (fileData) {
            // Send file
            const formData = new FormData();
            formData.append('file', new Blob([fileData.content]), fileData.name);
            
            await this.apiRequest(`https://discord.com/api/v9/channels/${channelId}/messages`, {
                method: 'POST',
                headers: { 'Authorization': token },
                body: formData
            }, tokenId);
        }
    }

    async exitGroupChannel(token, channelId, tokenId) {
        await this.apiRequest(`https://discord.com/api/v9/channels/${channelId}?silent=false`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
        }, tokenId);
    }

    async fetchDirectMessageChannels(token, tokenId) {
        const response = await this.apiRequest('https://discord.com/api/v9/users/@me/channels', {
            headers: { 'Authorization': token }
        }, tokenId);
        return response.data || [];
    }

    // Utility methods
    async apiRequest(url, options, tokenId = '') {
        if (this.isStopping) throw new Error('Process stopped');

        try {
            const response = await fetch(url, options);
            const data = await response.json().catch(() => ({}));
            
            if (response.status === 429) {
                const retryAfter = (data.retry_after || 1) * 1000;
                this.addLog(`Rate limit: waiting ${retryAfter/1000}s`, 'warning', tokenId);
                await this.delay(retryAfter);
                return this.apiRequest(url, options, tokenId);
            }

            if (response.status >= 400) {
                throw new Error(`API error: ${response.status} - ${JSON.stringify(data)}`);
            }

            return { status: response.status, data };
        } catch (error) {
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Network error');
            }
            throw error;
        }
    }

    selectRecipients(friends, targetUsers) {
        const validFriends = friends.filter(friend => 
            friend.type === 1 && friend.id
        );

        if (targetUsers.length > 0) {
            return validFriends
                .filter(friend => targetUsers.includes(friend.id))
                .map(friend => friend.id)
                .slice(0, 9);
        }

        return validFriends
            .map(friend => friend.id)
            .slice(0, 9);
    }

    filterTargetChannels(channels, targetUsers) {
        return channels.filter(channel => {
            const recipient = channel.recipients?.[0];
            return recipient && (targetUsers.length === 0 || targetUsers.includes(recipient.id));
        });
    }

    async prepareFileData() {
        const fileInput = document.getElementById('fileInput');
        const file = fileInput.files[0];
        
        if (!file) return null;

        return {
            name: file.name,
            content: await this.readFileAsArrayBuffer(file),
            type: file.type
        };
    }

    async prepareIconData() {
        const iconInput = document.getElementById('iconInput');
        const file = iconInput.files[0];
        
        if (!file) return null;

        return await this.readFileAsDataURL(file);
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    getTokens() {
        const tokensText = document.getElementById('authTokens').value;
        return tokensText
            .split('\n')
            .map(token => token.trim())
            .filter(token => token.length > 0);
    }

    getTargetUsers() {
        const usersText = document.getElementById('targetUsers').value;
        return usersText
            .split(',')
            .map(id => id.trim())
            .filter(id => id.length > 0);
    }

    getOptions() {
        return {
            sendDirectMessages: document.getElementById('enableDirectMessages').checked,
            autoExitGroups: document.getElementById('autoExitGroups').checked,
            detailedLogging: document.getElementById('enableLogging').checked
        };
    }

    hashToken(token) {
        return btoa(token.substring(0, 10)).substring(0, 8);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // UI update methods
    addLog(message, type = 'info', tokenId = '') {
        const logOutput = document.getElementById('logOutput');
        const time = new Date().toLocaleTimeString();
        const tokenPrefix = tokenId ? `[${tokenId}] ` : '';
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry status-${type}`;
        logEntry.innerHTML = `
            <span class="log-time">[${time}]</span>
            ${tokenPrefix}${message}
        `;

        logOutput.appendChild(logEntry);
        logOutput.scrollTop = logOutput.scrollHeight;

        // Check detailed logging setting
        const showDetailed = document.getElementById('enableLogging').checked;
        if (!showDetailed && type === 'info') {
            logEntry.style.display = 'none';
        }
    }

    updateTokenCounters() {
        document.getElementById('totalTokens').textContent = this.allTokens.size;
        document.getElementById('activeTokens').textContent = this.activeTokens.size;
        document.getElementById('completedTokens').textContent = this.completedTokens.size;
    }

    updateButtonStates() {
        const startBtn = document.getElementById('startProcess');
        const stopBtn = document.getElementById('stopProcess');

        startBtn.disabled = this.isProcessing;
        stopBtn.disabled = !this.isProcessing;

        if (this.isProcessing) {
            startBtn.classList.add('loading');
        } else {
            startBtn.classList.remove('loading');
        }
    }
}

// Application initialization
document.addEventListener('DOMContentLoaded', () => {
    new CommunicationManager();
});
