class DiscordManager {
    constructor() {
        this.token = '';
        this.messageContent = '';
        this.targetUserIds = [];
        this.isRunning = false;
        this.stats = {
            groupsCreated: 0,
            messagesSent: 0,
            groupsTarget: 10,
            messagesTarget: 5
        };
        this.settings = {
            showLogs: true,
            spamDm: false,
            leaveGroup: false,
            pingTest: true
        };
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSettings();
        this.startPingTest();
        this.updateStats();
    }

    bindEvents() {
        document.getElementById('messageFile').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        document.getElementById('groupCount').addEventListener('change', (e) => {
            this.stats.groupsTarget = parseInt(e.target.value) || 10;
            this.updateStats();
        });

        document.getElementById('messageCount').addEventListener('change', (e) => {
            this.stats.messagesTarget = parseInt(e.target.value) || 5;
            this.updateStats();
        });

        document.getElementById('token').addEventListener('input', (e) => {
            this.token = e.target.value.trim();
        });

        document.getElementById('userIds').addEventListener('input', (e) => {
            this.targetUserIds = e.target.value.split('\n')
                .map(id => id.trim())
                .filter(id => id.length > 0);
        });
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        document.getElementById('fileName').textContent = file.name;

        try {
            this.messageContent = await this.readFileContent(file);
            this.log('ファイルを読み込みました: ' + file.name, 'success');
        } catch (error) {
            this.log('ファイルの読み込みに失敗しました: ' + error.message, 'error');
        }
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('ファイル読み込みエラー'));
            reader.readAsText(file);
        });
    }

    async startOperation() {
        if (this.isRunning) return;

        const token = document.getElementById('token').value.trim();
        if (!token) {
            this.showNotification('トークンを入力してください', 'error');
            return;
        }

        if (!this.messageContent) {
            this.showNotification('メッセージファイルを選択してください', 'error');
            return;
        }

        if (this.targetUserIds.length === 0) {
            this.showNotification('グループに追加するユーザーIDを入力してください', 'error');
            return;
        }

        this.isRunning = true;
        this.stats.groupsCreated = 0;
        this.stats.messagesSent = 0;
        this.updateStats();

        document.getElementById('startBtn').disabled = true;
        document.getElementById('startBtn').textContent = '実行中...';
        document.getElementById('stopBtn').disabled = false;

        try {
            const isValid = await this.validateToken(token);
            if (!isValid) {
                throw new Error('無効なトークンです');
            }

            this.log('実行を開始します...', 'info');
            await this.executeMainOperation();

        } catch (error) {
            this.log('エラー: ' + error.message, 'error');
            this.showNotification('エラーが発生しました: ' + error.message, 'error');
        } finally {
            this.stopOperation();
        }
    }

    stopOperation() {
        this.isRunning = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('startBtn').textContent = '実行開始';
        document.getElementById('stopBtn').disabled = true;
        this.log('操作を停止しました', 'warning');
    }

    async executeMainOperation() {

        for (let i = 0; i < this.stats.groupsTarget && this.isRunning; i++) {
            const success = await this.createGroup();
            if (success) {
                this.stats.groupsCreated++;
                this.updateStats();
            }
            
            const progress = (this.stats.groupsCreated / this.stats.groupsTarget) * 100;
            document.getElementById('progressBar').style.width = progress + '%';
            
            await this.delay(2000);
        }
        
        if (this.settings.spamDm && this.isRunning) {
            await this.executeDmSpam();
        }

        if (this.isRunning) {
            this.log('すべての操作が完了しました', 'success');
            this.showNotification(`完了: ${this.stats.groupsCreated}個のグループを作成しました`, 'success');
        }
    }

    async createGroup() {
        try {
            this.log(`グループを作成中... (${this.stats.groupsCreated + 1}/${this.stats.groupsTarget})`, 'info');
            
            const groupData = await this.createGroupDM();
            
            if (groupData && groupData.id) {
                this.log(`グループを作成しました: ${groupData.id}`, 'success');
                
                if (this.messageContent) {
                    await this.sendGroupMessage(groupData.id, this.messageContent);
                }
                
                if (this.settings.leaveGroup) {
                    await this.leaveGroup(groupData.id);
                }
                
                return true;
            }
            return false;
            
        } catch (error) {
            this.log(`グループ作成失敗: ${error.message}`, 'error');
            return false;
        }
    }

    async createGroupDM() {

        const response = await fetch('https://discord.com/api/v9/users/@me/channels', {
            method: 'POST',
            headers: {
                'Authorization': this.token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recipients: this.targetUserIds.slice(0, 9) 
            })
        });

        if (response.status === 401) {
            throw new Error('トークンが無効です');
        }

        if (response.status === 403) {
            throw new Error('友達ではないユーザーが含まれています');
        }

        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            this.log(`レート制限: ${retryAfter}秒待機`, 'warning');
            await this.delay((parseInt(retryAfter) || 5) * 1000);
            return await this.createGroupDM(); // リトライ
        }

        if (!response.ok) {
            throw new Error(`APIエラー: ${response.status}`);
        }

        return await response.json();
    }

    async sendGroupMessage(channelId, message) {
        try {
            const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': this.token,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: message,
                    tts: false
                })
            });

            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                await this.delay((parseInt(retryAfter) || 2) * 1000);
                return await this.sendGroupMessage(channelId, message);
            }

            if (!response.ok) {
                throw new Error(`メッセージ送信失敗: ${response.status}`);
            }

            this.stats.messagesSent++;
            this.updateStats();
            this.log('グループメッセージを送信しました', 'success');
            return true;

        } catch (error) {
            this.log(`メッセージ送信エラー: ${error.message}`, 'error');
            return false;
        }
    }

    async leaveGroup(channelId) {
        try {
            await fetch(`https://discord.com/api/v9/channels/${channelId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': this.token
                }
            });
            this.log('グループから退出しました', 'info');
        } catch (error) {
            this.log(`グループ退出エラー: ${error.message}`, 'error');
        }
    }

    async executeDmSpam() {
        this.log('DMスパムを開始します...', 'info');
        
        for (let i = 0; i < this.stats.messagesTarget && this.isRunning; i++) {
            await this.sendDirectMessage();
            this.stats.messagesSent++;
            this.updateStats();
            await this.delay(1000); // スパム防止のため1秒待機
        }
    }

    async sendDirectMessage() {
        // 最初のユーザーにDMを送信
        if (this.targetUserIds.length > 0) {
            try {
                const dmChannel = await this.createDMChannel(this.targetUserIds[0]);
                if (dmChannel) {
                    await this.sendDM(dmChannel.id, this.messageContent);
                }
            } catch (error) {
                this.log(`DM送信エラー: ${error.message}`, 'error');
            }
        }
    }

    async createDMChannel(userId) {
        const response = await fetch('https://discord.com/api/v9/users/@me/channels', {
            method: 'POST',
            headers: {
                'Authorization': this.token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recipient_id: userId
            })
        });

        if (response.ok) {
            return await response.json();
        }
        return null;
    }

    async sendDM(channelId, message) {
        const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': this.token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: message
            })
        });

        if (response.ok) {
            this.log('DMを送信しました', 'success');
            return true;
        }
        return false;
    }

    async validateToken(token) {
        this.log('トークンを検証中...', 'info');
        
        try {
            const response = await fetch('https://discord.com/api/v9/users/@me', {
                headers: {
                    'Authorization': token
                }
            });

            if (response.ok) {
                const userData = await response.json();
                this.log(`トークン有効: ${userData.username}#${userData.discriminator}`, 'success');
                return true;
            } else {
                throw new Error('トークンが無効です');
            }
        } catch (error) {
            throw new Error('トークン検証失敗: ' + error.message);
        }
    }

    async startPingTest() {
        setInterval(async () => {
            if (this.settings.pingTest && this.token) {
                const ping = await this.testPing();
                this.updatePingDisplay(ping);
            }
        }, 10000);
    }

    async testPing() {
        try {
            const startTime = Date.now();
            await fetch('https://discord.com/api/v9/gateway', {
                method: 'GET',
                headers: {
                    'Authorization': this.token
                }
            });
            return Date.now() - startTime;
        } catch (error) {
            return -1;
        }
    }

    updatePingDisplay(ping) {
        const pingElement = document.getElementById('pingValue');
        const indicator = document.querySelector('.ping-indicator');
        
        if (ping >= 0) {
            pingElement.textContent = `${ping}ms`;
            if (ping < 100) {
                indicator.className = 'ping-indicator ping-good';
            } else if (ping < 300) {
                indicator.className = 'ping-indicator ping-medium';
            } else {
                indicator.className = 'ping-indicator ping-bad';
            }
        } else {
            pingElement.textContent = '---';
            indicator.className = 'ping-indicator ping-bad';
        }
    }

    log(message, type = 'info') {
        if (!this.settings.showLogs) return;
        
        const logBox = document.getElementById('logBox');
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.innerHTML = `
            <span class="log-time">[${timestamp}]</span>
            <span class="log-message">${message}</span>
        `;
        
        logBox.appendChild(logEntry);
        logBox.scrollTop = logBox.scrollHeight;
    }

    showNotification(message, type = 'info') {
        this.log(message, type);
        
        if (Notification.permission === 'granted') {
            new Notification('Discord Manager', {
                body: message,
                icon: '/favicon.ico'
            });
        }
    }

    updateStats() {
        document.getElementById('groupsCreated').textContent = this.stats.groupsCreated;
        document.getElementById('messagesSent').textContent = this.stats.messagesSent;
        document.getElementById('groupsTarget').textContent = this.stats.groupsTarget;
        document.getElementById('messagesTarget').textContent = this.stats.messagesTarget;
        
        const successRate = this.stats.groupsTarget > 0 ? 
            Math.round((this.stats.groupsCreated / this.stats.groupsTarget) * 100) : 0;
        document.getElementById('successRate').textContent = successRate + '%';
    }

    loadSettings() {
        const saved = localStorage.getItem('discordManagerSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        this.updateCheckboxes();
    }

    saveSettings() {
        localStorage.setItem('discordManagerSettings', JSON.stringify(this.settings));
    }

    updateCheckboxes() {
        Object.keys(this.settings).forEach(key => {
            const checkbox = document.getElementById(key);
            if (checkbox) {
                checkbox.checked = this.settings[key];
            }
        });
    }

    toggleSetting(setting) {
        this.settings[setting] = !this.settings[setting];
        this.saveSettings();
        this.updateCheckboxes();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

function toggleSetting(setting) {
    window.discordManager.toggleSetting(setting);
}

function startOperation() {
    window.discordManager.startOperation();
}

function stopOperation() {
    window.discordManager.stopOperation();
}

function clearLogs() {
    document.getElementById('logBox').innerHTML = '';
    window.discordManager.log('ログをクリアしました', 'info');
}

if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

document.addEventListener('DOMContentLoaded', () => {
    window.discordManager = new DiscordManager();
});
