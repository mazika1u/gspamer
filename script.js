class GroupSpammer {
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
            document.getElementById('fileName').textContent = file ? file.name : 'ファイルが選択されていません';
        });

        // アイコンアップロード
        document.getElementById('iconUploadArea').addEventListener('click', () => {
            document.getElementById('iconInput').click();
        });

        document.getElementById('iconInput').addEventListener('change', (event) => {
            const file = event.target.files[0];
            document.getElementById('iconFileName').textContent = file ? file.name : 'アイコンなし';
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
            this.addLog('トークンが入力されていません', 'error');
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
            await this.createGroups(token, fileData, iconData, targetUsers, options, tokenId);
            
            // DM送信処理
            if (options.sendDirectMessages && fileData) {
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

    async createGroups(token, fileData, iconData, targetUsers, options, tokenId) {
        let successCount = 0;
        let attemptCount = 0;
        const maxAttempts = 10;

        while (attemptCount < maxAttempts && !this.isStopping) {
            attemptCount++;
            
            try {
                // フレンドリストを取得
                const friends = await this.getFriends(token, tokenId);
                if (!friends || friends.length === 0) {
                    this.addLog('フレンドリストが空です', 'warning', tokenId);
                    break;
                }

                // 対象ユーザーを選択
                const recipientIds = this.selectFriends(friends, targetUsers);
                
                if (recipientIds.length === 0) {
                    this.addLog('グループ作成に適したユーザーが見つかりません', 'warning', tokenId);
                    break;
                }

                this.addLog(`${recipientIds.length}人のユーザーでグループ作成を試みます`, 'info', tokenId);

                // グループDMを作成
                const channel = await this.createGroupDM(token, recipientIds, tokenId);
                if (!channel) {
                    this.addLog('グループ作成に失敗しました', 'error', tokenId);
                    continue;
                }

                this.addLog(`グループDMを作成しました: ${channel.id}`, 'success', tokenId);

                // グループ名とアイコンを設定
                if (iconData) {
                    await this.setGroupIcon(token, channel.id, iconData, tokenId);
                }

                // ファイルを送信
                if (fileData) {
                    await this.sendFileToChannel(token, channel.id, fileData, tokenId);
                }

                // 自動退出
                if (options.autoExitGroups) {
                    await this.leaveGroup(token, channel.id, tokenId);
                }

                successCount++;
                this.addLog(`グループ作成成功 (${successCount}個目)`, 'success', tokenId);

                // レート制限回避
                await this.delay(3000 + Math.random() * 2000);

            } catch (error) {
                this.addLog(`グループ作成エラー: ${error.message}`, 'error', tokenId);
                await this.delay(5000);
            }
        }
    }

    async sendDirectMessages(token, fileData, targetUsers, options, tokenId) {
        try {
            const channels = await this.getDMChannels(token, tokenId);
            const targetChannels = this.filterChannels(channels, targetUsers);
            
            this.addLog(`${targetChannels.length}件のDMチャンネルにファイルを送信します`, 'info', tokenId);

            let sentCount = 0;
            for (const channel of targetChannels) {
                if (this.isStopping) break;
                
                try {
                    await this.sendFileToChannel(token, channel.id, fileData, tokenId);
                    sentCount++;
                    await this.delay(1500 + Math.random() * 1000);
                } catch (error) {
                    this.addLog(`DM送信失敗: ${error.message}`, 'error', tokenId);
                }
            }
            
            this.addLog(`${sentCount}件のDMにファイルを送信しました`, 'success', tokenId);
        } catch (error) {
            this.addLog(`DM取得失敗: ${error.message}`, 'error', tokenId);
        }
    }

    // API通信メソッド
    async validateToken(token) {
        try {
            const response = await this.apiCall('https://discord.com/api/v9/users/@me', {
                headers: { 
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.status === 200 && response.data.id) {
                this.addLog(`トークン有効: ${response.data.username}`, 'success');
                return true;
            }
            return false;
        } catch (error) {
            this.addLog(`トークン検証エラー: ${error.message}`, 'error');
            return false;
        }
    }

    async getFriends(token, tokenId) {
        try {
            const response = await this.apiCall('https://discord.com/api/v9/users/@me/relationships', {
                headers: { 
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            }, tokenId);

            // フレンドのみをフィルタリング (type: 1 = フレンド, type: 2 = ブロック, type: 3 = 保留中)
            if (response.data && Array.isArray(response.data)) {
                const friends = response.data.filter(relationship => 
                    relationship.type === 1 && 
                    relationship.user && 
                    relationship.user.id
                );
                return friends.map(friend => friend.user);
            }
            return [];
        } catch (error) {
            this.addLog(`フレンドリスト取得エラー: ${error.message}`, 'error', tokenId);
            return [];
        }
    }

    async createGroupDM(token, recipientIds, tokenId) {
        try {
            const response = await this.apiCall('https://discord.com/api/v9/users/@me/channels', {
                method: 'POST',
                headers: { 
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    recipients: recipientIds 
                })
            }, tokenId);

            return response.data;
        } catch (error) {
            throw new Error(`グループDM作成失敗: ${error.message}`);
        }
    }

    async setGroupIcon(token, channelId, iconData, tokenId) {
        try {
            // アイコンデータからdata:image/png;base64,の部分を除去
            const base64Data = iconData.replace(/^data:image\/\w+;base64,/, '');
            
            await this.apiCall(`https://discord.com/api/v9/channels/${channelId}`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    name: `group-${Date.now()}`,
                    icon: `data:image/png;base64,${base64Data}`
                })
            }, tokenId);
        } catch (error) {
            this.addLog(`アイコン設定失敗: ${error.message}`, 'warning', tokenId);
        }
    }

    async sendFileToChannel(token, channelId, fileData, tokenId) {
        try {
            const formData = new FormData();
            const blob = new Blob([fileData.content], { type: fileData.type });
            formData.append('file', blob, fileData.name);
            
            // メッセージ内容も追加（オプション）
            formData.append('content', ' ');
            
            await this.apiCall(`https://discord.com/api/v9/channels/${channelId}/messages`, {
                method: 'POST',
                headers: { 
                    'Authorization': token
                    // Content-TypeはFormDataが自動設定
                },
                body: formData
            }, tokenId);
            
            this.addLog(`ファイル送信成功: ${fileData.name}`, 'success', tokenId);
        } catch (error) {
            throw new Error(`ファイル送信失敗: ${error.message}`);
        }
    }

    async leaveGroup(token, channelId, tokenId) {
        try {
            await this.apiCall(`https://discord.com/api/v9/channels/${channelId}`, {
                method: 'DELETE',
                headers: { 
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            }, tokenId);
            
            this.addLog('グループから退出しました', 'success', tokenId);
        } catch (error) {
            this.addLog(`グループ退出失敗: ${error.message}`, 'warning', tokenId);
        }
    }

    async getDMChannels(token, tokenId) {
        try {
            const response = await this.apiCall('https://discord.com/api/v9/users/@me/channels', {
                headers: { 
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            }, tokenId);

            // DMチャンネルのみをフィルタリング (type: 1 = DM, type: 3 = グループDM)
            if (response.data && Array.isArray(response.data)) {
                return response.data.filter(channel => 
                    channel.type === 1 && // 1: DM, 3: グループDM
                    channel.recipients && 
                    channel.recipients.length > 0
                );
            }
            return [];
        } catch (error) {
            throw new Error(`DMチャンネル取得失敗: ${error.message}`);
        }
    }

    // API呼び出しユーティリティ
    async apiCall(url, options, tokenId = '') {
        if (this.isStopping) throw new Error('処理が停止されました');

        try {
            const response = await fetch(url, options);
            const data = await response.json().catch(() => ({}));
            
            // レート制限処理
            if (response.status === 429) {
                const retryAfter = (data.retry_after || 1) * 1000;
                this.addLog(`レート制限: ${retryAfter/1000}秒待機`, 'warning', tokenId);
                await this.delay(retryAfter);
                return this.apiCall(url, options, tokenId);
            }

            if (response.status >= 400) {
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
            }

            return { status: response.status, data };
        } catch (error) {
            if (error.message.includes('Failed to fetch')) {
                throw new Error('ネットワークエラー');
            }
            throw error;
        }
    }

    // ユーティリティメソッド
    selectFriends(friends, targetUsers) {
        let filteredFriends = friends;

        // 特定ユーザーIDが指定されている場合はフィルタリング
        if (targetUsers && targetUsers.length > 0) {
            filteredFriends = friends.filter(friend => 
                targetUsers.includes(friend.id)
            );
        }

        // ランダムに最大9人選択
        const shuffled = [...filteredFriends].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 9).map(friend => friend.id);
    }

    filterChannels(channels, targetUsers) {
        if (targetUsers && targetUsers.length > 0) {
            return channels.filter(channel => 
                channel.recipients.some(recipient => 
                    targetUsers.includes(recipient.id)
                )
            );
        }
        return channels;
    }

    async prepareFileData() {
        const fileInput = document.getElementById('fileInput');
        const file = fileInput.files[0];
        
        if (!file) {
            this.addLog('ファイルが選択されていません', 'warning');
            return null;
        }

        try {
            const content = await this.readFileAsArrayBuffer(file);
            return {
                name: file.name,
                content: content,
                type: file.type,
                size: file.size
            };
        } catch (error) {
            this.addLog(`ファイル読み込みエラー: ${error.message}`, 'error');
            return null;
        }
    }

    async prepareIconData() {
        const iconInput = document.getElementById('iconInput');
        const file = iconInput.files[0];
        
        if (!file) return null;

        try {
            return await this.readFileAsDataURL(file);
        } catch (error) {
            this.addLog(`アイコン読み込みエラー: ${error.message}`, 'error');
            return null;
        }
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsArrayBuffer(file);
        });
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('アイコンの読み込みに失敗しました'));
            reader.readAsDataURL(file);
        });
    }

    getTokens() {
        const tokensText = document.getElementById('authTokens').value;
        return tokensText
            .split(/[\n,]+/)
            .map(token => token.trim())
            .filter(token => token.length > 0 && token !== 'undefined');
    }

    getTargetUsers() {
        const usersText = document.getElementById('targetUsers').value;
        return usersText
            .split(/[\n,]+/)
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
        // トークンの簡易ハッシュ（表示用）
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
            hash = ((hash << 5) - hash) + token.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16).substring(0, 6);
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
            startBtn.textContent = '実行中...';
        } else {
            startBtn.classList.remove('loading');
            startBtn.textContent = 'じっこう';
        }
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    window.groupSpammer = new GroupSpammer();
    console.log('グループスパマー initialized');
});
