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
        // ファイルアップロード
        document.getElementById('fileUploadArea').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (event) => {
            const file = event.target.files[0];
            document.getElementById('fileName').textContent = file ? file.name : 'ファイル未選択';
        });

        // アイコンアップロード
        document.getElementById('iconUploadArea').addEventListener('click', () => {
            document.getElementById('iconInput').click();
        });

        document.getElementById('iconInput').addEventListener('change', (event) => {
            const file = event.target.files[0];
            document.getElementById('iconFileName').textContent = file ? file.name : 'アイコン未選択';
        });

        // ボタンイベント
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
            this.addLog('認証トークンが入力されていません', 'error');
            return;
        }

        this.isProcessing = true;
        this.isStopping = false;
        this.activeTokens.clear();
        this.completedTokens.clear();
        this.allTokens = new Set(tokens);
        
        this.updateTokenCounters();
        this.updateButtonStates();
        this.addLog('処理を開始します...', 'info');

        try {
            const fileData = await this.prepareFileData();
            const iconData = await this.prepareIconData();
            const targetUsers = this.getTargetUsers();
            const options = this.getOptions();

            // 各トークンで並列処理
            const promises = tokens.map(token => 
                this.processSingleToken(token, fileData, iconData, targetUsers, options)
            );

            await Promise.allSettled(promises);
            
            if (!this.isStopping) {
                this.addLog('すべての処理が完了しました', 'success');
            }
        } catch (error) {
            this.addLog(`処理中にエラーが発生: ${error.message}`, 'error');
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
        this.addLog('処理を停止しました', 'warning');
    }

    async processSingleToken(token, fileData, iconData, targetUsers, options) {
        if (this.isStopping) return;

        const tokenId = this.hashToken(token);
        this.activeTokens.add(tokenId);
        this.updateTokenCounters();

        try {
            this.addLog(`トークン検証中...`, 'info', tokenId);
            
            const isValid = await this.validateToken(token);
            if (!isValid) {
                this.addLog('トークンが無効です', 'error', tokenId);
                return;
            }

            if (this.isStopping) return;

            // グループ作成処理
            await this.createCommunicationGroups(token, fileData, iconData, targetUsers, options, tokenId);
            
            // DM送信処理
            if (options.sendDirectMessages) {
                await this.sendDirectMessages(token, fileData, targetUsers, options, tokenId);
            }

            this.completedTokens.add(tokenId);
            this.addLog('処理完了', 'success', tokenId);

        } catch (error) {
            this.addLog(`処理失敗: ${error.message}`, 'error', tokenId);
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
                    this.addLog('対象ユーザーが見つかりません', 'warning', tokenId);
                    break;
                }

                const channel = await this.createGroupChannel(token, recipientIds, tokenId);
                if (!channel) continue;

                // グループ設定
                await this.configureGroupChannel(token, channel.id, iconData, tokenId);
                
                // ファイル送信
                await this.sendChannelMessage(token, channel.id, fileData, tokenId);
                
                // 退出処理
                if (options.autoExitGroups) {
                    await this.exitGroupChannel(token, channel.id, tokenId);
                }

                successCount++;
                this.addLog(`グループ作成成功 (${successCount}回目)`, 'success', tokenId);

                // レート制限回避
                await this.delay(2000 + Math.random() * 3000);

            } catch (error) {
                this.addLog(`グループ作成失敗: ${error.message}`, 'error', tokenId);
                await this.delay(5000);
            }
        }
    }

    async sendDirectMessages(token, fileData, targetUsers, options, tokenId) {
        try {
            const channels = await this.fetchDirectMessageChannels(token, tokenId);
            const targetChannels = this.filterTargetChannels(channels, targetUsers);
            
            this.addLog(`${targetChannels.length}件のDMチャンネルを発見`, 'info', tokenId);

            for (const channel of targetChannels) {
                if (this.isStopping) break;
                
                try {
                    await this.sendChannelMessage(token, channel.id, fileData, tokenId);
                    await this.delay(1000 + Math.random() * 2000);
                } catch (error) {
                    this.addLog(`DM送信失敗: ${error.message}`, 'error', tokenId);
                }
            }
        } catch (error) {
            this.addLog(`DM取得失敗: ${error.message}`, 'error', tokenId);
        }
    }

    // API通信メソッド
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
            // ファイル送信
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

    // ユーティリティメソッド
    async apiRequest(url, options, tokenId = '') {
        if (this.isStopping) throw new Error('処理が停止されました');

        try {
            const response = await fetch(url, options);
            const data = await response.json().catch(() => ({}));
            
            if (response.status === 429) {
                const retryAfter = (data.retry_after || 1) * 1000;
                this.addLog(`レート制限: ${retryAfter/1000}秒待機`, 'warning', tokenId);
                await this.delay(retryAfter);
                return this.apiRequest(url, options, tokenId);
            }

            if (response.status >= 400) {
                throw new Error(`APIエラー: ${response.status} - ${JSON.stringify(data)}`);
            }

            return { status: response.status, data };
        } catch (error) {
            if (error.message.includes('Failed to fetch')) {
                throw new Error('ネットワークエラー');
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

    // UI更新メソッド
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

        // 詳細ログ設定をチェック
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

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    new CommunicationManager();
});
