// script.js

// グローバル変数
let isRunning = false;
let groupsCreated = 0;
let messagesSent = 0;
let progressInterval;
let currentOperation = null;
let showAllLogs = false;
let runSpamDm = false;
let leaveGroup = false;
let stopSpam = false;

// DOM読み込み完了後の初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    testPing();
    initializeVideoControls();
});

// イベントリスナーの初期化
function initializeEventListeners() {
    // ファイル選択
    document.getElementById('messageFile').addEventListener('change', function(e) {
        const fileName = e.target.files[0] ? e.target.files[0].name : '未選択';
        document.getElementById('fileName').textContent = fileName;
    });

    // チェックボックスの初期状態を設定
    document.getElementById('pingTestCheckbox').classList.add('checked');
}

// ビデオコントロールの初期化
function initializeVideoControls() {
    const video = document.getElementById('bgVideo');
    // ビデオの読み込みが完了したら自動再生
    video.addEventListener('loadeddata', function() {
        video.play().catch(e => {
            console.log('自動再生がブロックされました:', e);
        });
    });
}

// ビデオの再生/一時停止
function toggleVideo() {
    const video = document.getElementById('bgVideo');
    const icon = document.getElementById('videoToggleIcon');
    
    if (video.paused) {
        video.play();
        icon.className = 'fas fa-pause';
    } else {
        video.pause();
        icon.className = 'fas fa-play';
    }
}

// ミュート切り替え
function toggleMute() {
    const video = document.getElementById('bgVideo');
    const icon = document.getElementById('volumeToggleIcon');
    
    video.muted = !video.muted;
    icon.className = video.muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
}

// チェックボックスのトグル関数
function toggleCheckbox(id) {
    const checkbox = document.getElementById(id + 'Checkbox');
    checkbox.classList.toggle('checked');
    
    switch(id) {
        case 'showLogs':
            showAllLogs = checkbox.classList.contains('checked');
            break;
        case 'spamDm':
            runSpamDm = checkbox.classList.contains('checked');
            break;
        case 'leaveGroup':
            leaveGroup = checkbox.classList.contains('checked');
            break;
        case 'pingTest':
            if (checkbox.classList.contains('checked')) {
                testPing();
            }
            break;
    }
}

// Pingテスト関数
async function testPing() {
    const startTime = Date.now();
    const pingValueElement = document.getElementById('pingValue');
    const pingIndicator = document.querySelector('.ping-indicator');
    
    pingValueElement.textContent = '測定中...';
    
    try {
        const response = await fetch('https://discord.com/api/v9/gateway', { method: 'HEAD' });
        const ping = Date.now() - startTime;
        
        pingValueElement.textContent = ping;
        
        if (ping < 100) {
            pingIndicator.className = 'ping-indicator ping-good';
        } else if (ping < 300) {
            pingIndicator.className = 'ping-indicator ping-medium';
        } else {
            pingIndicator.className = 'ping-indicator ping-bad';
        }
        
        addLog(`Pingテスト: ${ping}ms`, 'success');
    } catch (error) {
        pingValueElement.textContent = 'エラー';
        pingIndicator.className = 'ping-indicator ping-bad';
        addLog('Pingテストに失敗しました: ' + error.message, 'error');
    }
}

// ログ追加関数
function addLog(message, type = 'info') {
    const logBox = document.getElementById('logBox');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${timestamp}] `;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = `log-message log-${type}`;
    messageSpan.textContent = message;
    
    logEntry.appendChild(timeSpan);
    logEntry.appendChild(messageSpan);
    logBox.appendChild(logEntry);
    
    logBox.scrollTop = logBox.scrollHeight;
    
    if (!showAllLogs && type === 'info') {
        logEntry.style.display = 'none';
    }
}

// 進捗バー更新関数
function updateProgress() {
    const groupCount = parseInt(document.getElementById('groupCount').value) || 10;
    const messageCount = parseInt(document.getElementById('messageCount').value) || 5;
    const totalOperations = groupCount * (1 + messageCount);
    
    const progress = ((groupsCreated * (1 + messageCount)) + messagesSent) / totalOperations * 100;
    document.getElementById('progressBar').style.width = `${Math.min(progress, 100)}%`;
}

// 統計更新関数
function updateStats() {
    document.getElementById('groupsCreated').textContent = groupsCreated;
    document.getElementById('messagesSent').textContent = messagesSent;
    document.getElementById('floatGroups').textContent = groupsCreated;
    document.getElementById('floatMessages').textContent = messagesSent;
    
    const successRate = groupsCreated > 0 ? Math.round((messagesSent / (groupsCreated * 5)) * 100) : 100;
    document.getElementById('successRate').textContent = `${successRate}%`;
    
    updateProgress();
}

// 通知表示関数
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    if (type === 'success') {
        notification.style.borderLeftColor = '#57f287';
    } else if (type === 'error') {
        notification.style.borderLeftColor = '#ed4245';
    } else if (type === 'warning') {
        notification.style.borderLeftColor = '#fee75c';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// メッセージファイルの読み込み関数
function loadMessageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                
                if (file.name.endsWith('.json')) {
                    const messages = JSON.parse(content);
                    resolve(messages);
                } else {
                    const messages = content.split('\n').filter(line => line.trim() !== '');
                    resolve(messages);
                }
            } catch (error) {
                reject(new Error('ファイルの読み込みに失敗しました: ' + error.message));
            }
        };
        
        reader.onerror = function() {
            reject(new Error('ファイルの読み込みに失敗しました'));
        };
        
        reader.readAsText(file);
    });
}

// Base64エンコード関数
function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// トークン検証関数
async function isTokenValid(token) {
    try {
        const response = await fetch('https://discord.com/api/v9/users/@me', {
            headers: { 'Authorization': token }
        });
        
        if (response.status < 300) {
            const userData = await response.json();
            addLog(`✅ トークン有効：${userData.username}`, 'success');
            return true;
        } else {
            addLog(`❌ トークン無効（status ${response.status}）`, 'error');
            return false;
        }
    } catch (error) {
        addLog(`❌ トークン検証エラー: ${error.message}`, 'error');
        return false;
    }
}

// Discord APIを使用してグループDMを作成
async function createGroupDM(token, userIds, groupName, iconData = null) {
    try {
        const response = await fetch('https://discord.com/api/v9/users/@me/channels', {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recipients: userIds
            })
        });
        
        if (response.status === 429) {
            const rateLimit = await response.json();
            const waitTime = rateLimit.retry_after * 1000;
            addLog(`⏳ グループ作成レート制限: ${rateLimit.retry_after}s`, 'warning');
            await sleep(waitTime);
            return await createGroupDM(token, userIds, groupName, iconData);
        } else if (response.status === 401) {
            throw new Error('無効なトークンです');
        } else if (response.status === 403) {
            throw new Error('友達のみグループDMを作成できます');
        } else if (response.status === 400) {
            throw new Error('無効なユーザーIDが含まれています');
        } else if (!response.ok) {
            throw new Error(`APIエラー: ${response.status}`);
        }
        
        const data = await response.json();
        const channelId = data.id;
        
        // グループ名を設定
        if (groupName) {
            await updateGroupDM(token, channelId, groupName, iconData);
        }
        
        return channelId;
    } catch (error) {
        throw error;
    }
}

// グループDMを更新（名前・アイコン設定）
async function updateGroupDM(token, channelId, name, icon) {
    try {
        const updateData = {};
        if (name) updateData.name = name;
        if (icon) updateData.icon = icon;
        
        const response = await fetch(`https://discord.com/api/v9/channels/${channelId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.status === 429) {
            const rateLimit = await response.json();
            const waitTime = rateLimit.retry_after * 1000;
            addLog(`⏳ グループ編集レート制限: ${rateLimit.retry_after}s`, 'warning');
            await sleep(waitTime);
            return await updateGroupDM(token, channelId, name, icon);
        }
        
        return response.ok;
    } catch (error) {
        addLog(`グループ更新エラー: ${error.message}`, 'error');
        return false;
    }
}

// メッセージを送信
async function sendMessage(token, channelId, message) {
    try {
        const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: message,
                mobile_network_type: 'wifi',
                tts: false,
                flags: 0,
                signal_strength: 0
            })
        });
        
        if (response.status === 429) {
            const rateLimit = await response.json();
            const waitTime = rateLimit.retry_after * 1000;
            addLog(`⏳ メッセージ送信レート制限: ${rateLimit.retry_after}s`, 'warning');
            await sleep(waitTime);
            return await sendMessage(token, channelId, message);
        } else if (response.status === 401) {
            throw new Error('無効なトークンです');
        } else if (response.status === 403) {
            throw new Error('メッセージを送信する権限がありません');
        } else if (!response.ok) {
            throw new Error(`メッセージ送信エラー: ${response.status}`);
        }
        
        const data = await response.json();
        if (showAllLogs) {
            addLog(`メッセージ送信詳細: ${JSON.stringify(data)}`, 'info');
        }
        
        return data;
    } catch (error) {
        throw error;
    }
}

// グループDMから退出
async function leaveGroupDM(token, channelId) {
    try {
        const response = await fetch(`https://discord.com/api/v9/channels/${channelId}?silent=false`, {
            method: 'DELETE',
            headers: {
                'Authorization': token
            }
        });
        
        if (response.status === 429) {
            const rateLimit = await response.json();
            const waitTime = (rateLimit.retry_after || 1) * 1000;
            addLog(`⏳ 退出レート制限: ${rateLimit.retry_after}s`, 'warning');
            await sleep(waitTime);
            return await leaveGroupDM(token, channelId);
        } else if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`退出失敗: ${response.status} - ${errorText}`);
        }
        
        addLog(`✅ グループ ${channelId} を正常に退出しました。`, 'success');
        return true;
    } catch (error) {
        addLog(`❌ 退出失敗: ${error.message}`, 'error');
        return false;
    }
}

// フレンドリストを取得
async function getFriendList(token) {
    try {
        const response = await fetch('https://discord.com/api/v9/users/@me/relationships', {
            headers: { 'Authorization': token }
        });
        
        if (response.status === 429) {
            const rateLimit = await response.json();
            const waitTime = rateLimit.retry_after * 1000;
            addLog(`⏳ フレンド取得レート制限: ${rateLimit.retry_after}s`, 'warning');
            await sleep(waitTime);
            return await getFriendList(token);
        }
        
        const friends = await response.json();
        return friends.filter(friend => friend.type === 1).map(friend => friend.id);
    } catch (error) {
        addLog(`フレンドリスト取得エラー: ${error.message}`, 'error');
        return [];
    }
}

// ランダムな絵文字を生成
function getRandomEmojis(count) {
    const emojis = '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪🤨🧐🤓😎🥸🤠🤡🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑🫡🫢🫣🤤😪😴😵😵‍💫😲😯😬🙄😮‍💨😷🤒🤕🤢🤮🤧😇🥹🤑🤠😈👿👹👺💀☠️👻👽🤖🎃😺😸😹😻😼😽🙀😿😾';
    const emojiArray = Array.from(emojis);
    let result = '';
    
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * emojiArray.length);
        result += emojiArray[randomIndex];
    }
    
    return result;
}

// スリープ関数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// メインの操作実行関数
async function startOperation() {
    if (isRunning) {
        addLog('操作は既に実行中です', 'warning');
        return;
    }
    
    // 入力値の検証
    const token = document.getElementById('token').value.trim();
    if (!token) {
        showNotification('Discordトークンを入力してください', 'error');
        return;
    }
    
    const userIdsInput = document.getElementById('userIds').value.trim();
    const userIds = userIdsInput ? userIdsInput.split(/[\s,]+/).filter(id => id.trim() !== '') : null;
    
    const groupCount = parseInt(document.getElementById('groupCount').value) || 10;
    const messageCount = parseInt(document.getElementById('messageCount').value) || 5;
    
    // メッセージファイルの読み込み
    const messageFile = document.getElementById('messageFile').files[0];
    let messages = ['# おぜうの集い万歳\n## 今すぐ参加しよう\ndiscord.gg/ozeutop\nozetudo.net\nozeu.site'];
    
    if (messageFile) {
        try {
            messages = await loadMessageFile(messageFile);
            addLog(`メッセージファイルを読み込みました: ${messages.length}件のメッセージ`, 'success');
        } catch (error) {
            addLog(error.message, 'error');
            showNotification('メッセージファイルの読み込みに失敗しました', 'error');
            return;
        }
    }
    
    // トークン検証
    const isValidToken = await isTokenValid(token);
    if (!isValidToken) {
        showNotification('無効なトークンです', 'error');
        return;
    }
    
    // 実行状態を設定
    isRunning = true;
    stopSpam = false;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    
    addLog('🚀 実行開始...', 'success');
    showNotification('グループDM作成を開始しました', 'success');
    
    // 進捗更新のインターバルを設定
    progressInterval = setInterval(updateStats, 500);
    
    try {
        // グループ作成とメッセージ送信を実行
        await createGroups(token, userIds, groupCount, messages[0]);
        
        if (!stopSpam) {
            addLog('✅ すべての操作が完了しました', 'success');
            showNotification('すべての操作が完了しました', 'success');
        }
    } catch (error) {
        addLog(`❌ エラー: ${error.message}`, 'error');
    } finally {
        stopOperation();
    }
}

// グループ作成関数
async function createGroups(token, userIds, count, message) {
    let created = 0;
    
    do {
        if (stopSpam) return;
        
        try {
            const groupName = 'spam-by-ozeu-' + getRandomEmojis(10);
            const targetUserIds = userIds || await getFriendList(token);
            
            if (targetUserIds.length === 0) {
                addLog('❌ 対象ユーザーがいなくなったため、処理を中断します', 'error');
                break;
            }
            
            const channelId = await createGroupDM(
                token, 
                targetUserIds.slice(0, 9),
                groupName
            );
            
            created++;
            groupsCreated++;
            addLog(`✅ グループ作成成功 (${created}個目)`, 'success');
            
            // メッセージ送信
            for (let i = 0; i < messageCount && !stopSpam; i++) {
                await sendMessage(token, channelId, message);
                messagesSent++;
                addLog(`✅ メッセージ送信成功`, 'success');
                await sleep(1000);
            }
            
            // グループ退出
            if (leaveGroup) {
                await leaveGroupDM(token, channelId);
            }
            
            // レート制限回避のための遅延
            await sleep(2000);
            
        } catch (error) {
            addLog(`❌ グループ作成エラー: ${error.message}`, 'error');
        }
        
        updateStats();
    } while (created < count && !stopSpam);
}

// 操作停止関数
function stopOperation() {
    isRunning = false;
    stopSpam = true;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    addLog('操作を停止しました', 'warning');
}

// ログ削除関数
function clearLogs() {
    document.getElementById('logBox').innerHTML = '';
    addLog('ログをクリアしました', 'info');
}

// 定期的なPingテスト
setInterval(() => {
    if (document.getElementById('pingTestCheckbox').classList.contains('checked')) {
        testPing();
    }
}, 30000);
