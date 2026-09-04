        // 语言配置 - 语言包已提取到独立文件（lang_zh.js、lang_en.js）
        // 通过全局注册表 window.i18nMessages 加载，便于将来扩展更多语言
        // 扩展方法：新增 lang_xx.js（注册 window.i18nMessages['xx'] = {...}），并在 index.html 中添加对应 <script> 引用
        const i18n = window.i18nMessages || {};
        // （语言包 en 定义已迁移至 lang_en.js）
        
        let currentLanguage = localStorage.getItem('language') || 'zh';
        
        // 设置语言
        function setLanguage(lang) {
            currentLanguage = lang;
            localStorage.setItem('language', lang);
            applyLanguage();
        }
        
        // 应用语言
        function applyLanguage() {
            // 降级回退：当前语言包未加载时，回退到中文，再回退到空对象
            const texts = i18n[currentLanguage] || i18n['zh'] || {};
            
            // 更新所有带有 data-i18n 属性的元素
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (texts[key]) {
                    el.textContent = texts[key];
                }
            });
            
            // 更新所有带有 data-i18n-placeholder 属性的元素
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (texts[key]) {
                    el.placeholder = texts[key];
                }
            });
            
            // 更新所有带有 data-i18n-title 属性的元素（title 属性）
            document.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                if (texts[key]) {
                    el.title = texts[key];
                }
            });
            
            // 更新语言文本状态
            const langZh = document.getElementById('langZh');
            const langEn = document.getElementById('langEn');
            if (langZh) langZh.classList.toggle('active', currentLanguage === 'zh');
            if (langEn) langEn.classList.toggle('active', currentLanguage === 'en');
            
            // 重新加载标题、链接和标签页以应用语言设置
            loadTitle();
            loadLinks();
            loadTabs();
        }
        
        // 获取翻译文本
        function t(key, params = {}) {
            // 降级回退：当前语言包未加载时，回退到中文，再回退到空对象
            const langPack = i18n[currentLanguage] || i18n['zh'] || {};
            let text = langPack[key] || key;
            // 替换模板中的占位符 {paramName}
            Object.keys(params).forEach(param => {
                text = text.replace(`{${param}}`, params[param]);
            });
            return text;
        }
        
        // 切换锁定模式
        async function toggleLockMode() {
            try {
                const newLockState = !isLockMode;
                
                debugLog('toggleLockMode called, newLockState:', newLockState);
                
                // 重新获取最新的系统配置，确保 hasPassword 是最新的
                try {
                    const response = await fetch('/api/getSystemConfig');
                    const result = await response.json();
                    if (result.code === 0) {
                        hasPassword = result.hasPassword || false;
                        debugLog('Current hasPassword status:', hasPassword);
                    }
                } catch (error) {
                    console.error('Failed to get system config:', error);
                }
                
                // 根据操作类型决定
                if (newLockState) {
                    // 锁定时，总是显示密码对话框（可以设置新密码）
                    debugLog('Showing password modal for lock action');
                    showPasswordModal('lock', newLockState);
                } else {
                    // 解锁时，如果有密码需要验证，如果没有密码直接解锁
                    if (hasPassword) {
                        debugLog('Showing password modal for unlock action');
                        showPasswordModal('unlock', newLockState);
                    } else {
                        // 没有密码，直接解锁
                        debugLog('No password, applying lock state directly');
                        await applyLockState(newLockState);
                    }
                }
            } catch (error) {
                console.error('Error in toggleLockMode:', error);
                showToast('操作失败：' + error.message, 'error');
            }
        }
        
        // 应用锁定状态
        async function applyLockState(lockState, newPassword = null) {
            debugLog('applyLockState called with lockState:', lockState, 'newPassword:', newPassword);
            
            isLockMode = lockState;
            const lockBtn = document.getElementById('lockBtn');
            const importBtn = document.getElementById('importBtn');
            
            debugLog('isLockMode set to:', isLockMode);
            
            if (isLockMode) {
                // 进入锁定模式
                lockBtn.textContent = '🔒';
                lockBtn.setAttribute('data-i18n-title', 'unlockMode');
                lockBtn.title = t('unlockMode');
                importBtn.disabled = true;
                importBtn.style.opacity = '0.5';
                importBtn.style.cursor = 'not-allowed';
                showToast(t('lockedModeTip'), 'info');
            } else {
                // 退出锁定模式
                lockBtn.textContent = '🔓';
                lockBtn.setAttribute('data-i18n-title', 'lockMode');
                lockBtn.title = t('lockMode');
                importBtn.disabled = false;
                importBtn.style.opacity = '1';
                importBtn.style.cursor = 'pointer';
            }
            
            // 保存锁定状态到服务器
            try {
                const saveData = { locked: isLockMode };
                
                // 如果有新密码，一并保存
                if (newPassword !== null) {
                    saveData.password = newPassword;
                }
                
                debugLog('Saving system config:', saveData);
                await fetch('/api/saveSystemConfig', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(saveData)
                });
                debugLog('System config saved');
                
                // 更新 hasPassword 状态
                if (newPassword !== null) {
                    hasPassword = newPassword.length > 0;
                    debugLog('hasPassword updated to:', hasPassword);
                }
            } catch (error) {
                console.error('Failed to save lock state:', error);
                showToast(t('passwordVerifyFailed'), 'error');
                return;
            }
            
            // 重新加载选项卡以应用锁定状态
            debugLog('Reloading tabs and links');
            loadTabs();
            // 重新加载链接列表以应用锁定状态
            loadLinks();
            debugLog('applyLockState completed successfully');
        }
        
        // 显示密码对话框
        function showPasswordModal(action, lockState) {
            debugLog('showPasswordModal called with action:', action, 'lockState:', lockState);
            debugLog('Before setting - pendingLockState:', pendingLockState);
            
            passwordAction = action;
            pendingLockState = lockState;
            
            debugLog('After setting - pendingLockState:', pendingLockState);
            
            const modal = document.getElementById('passwordModal');
            debugLog('Modal element:', modal);
            
            if (!modal) {
                console.error('Password modal not found!');
                return;
            }
            
            const title = document.getElementById('passwordModalTitle');
            const oldPasswordSection = document.getElementById('oldPasswordSection');
            const passwordInputSection = document.getElementById('passwordInput').parentElement;
            const enableNewPasswordSection = document.getElementById('enableNewPasswordSection');
            const newPasswordSection = document.getElementById('newPasswordSection');
            const enableNewPasswordCheckbox = document.getElementById('enableNewPasswordCheckbox');
            const unlockDescriptionSection = document.getElementById('unlockDescriptionSection');
            const lockDescriptionSection = document.getElementById('lockDescriptionSection');
            
            // 清空输入框
            document.getElementById('oldPasswordInput').value = '';
            document.getElementById('passwordInput').value = '';
            document.getElementById('newPasswordInput').value = '';
            document.getElementById('confirmPasswordInput').value = '';
            enableNewPasswordCheckbox.checked = false;
            
            if (action === 'lock') {
                // 锁定操作：默认只显示"启用新密码"复选框
                title.textContent = t('lockTitle');
                unlockDescriptionSection.style.display = 'none';
                lockDescriptionSection.style.display = 'block';
                oldPasswordSection.style.display = 'none';
                passwordInputSection.style.display = 'none';
                enableNewPasswordSection.style.display = 'block';
                newPasswordSection.style.display = 'none';
            } else {
                // 解锁操作
                title.textContent = t('unlockTitle');
                unlockDescriptionSection.style.display = 'block';
                lockDescriptionSection.style.display = 'none';
                oldPasswordSection.style.display = 'none';
                passwordInputSection.style.display = 'block'; // 显示通用密码输入框
                enableNewPasswordSection.style.display = 'none';
                newPasswordSection.style.display = 'none';
            }
            
            toggleNewPasswordFields();
            modal.style.display = 'flex';
            debugLog('Modal display set to:', modal.style.display);
        }
        
        // 切换旧密码字段显示（用于锁定对话框）
        function toggleOldPasswordField() {
            const enableNewPassword = document.getElementById('enableNewPasswordCheckbox').checked;
            const oldPasswordSection = document.getElementById('oldPasswordSection');
            
            // 如果启用了新密码且当前有密码，则显示旧密码输入框
            if (enableNewPassword && hasPassword) {
                oldPasswordSection.style.display = 'block';
            } else {
                oldPasswordSection.style.display = 'none';
            }
        }
        
        // 关闭密码对话框
        function closePasswordModal() {
            document.getElementById('passwordModal').style.display = 'none';
            passwordAction = null;
            pendingLockState = false;
        }
        
        // 切换新密码字段显示
        function toggleNewPasswordFields() {
            const enabled = document.getElementById('enableNewPasswordCheckbox').checked;
            const newPasswordSection = document.getElementById('newPasswordSection');
            
            if (enabled) {
                newPasswordSection.style.display = 'block';
            } else {
                newPasswordSection.style.display = 'none';
            }
            
            // 同时更新旧密码字段的显示状态
            toggleOldPasswordField();
        }
        
        // 确认密码操作
        async function confirmPasswordAction() {
            debugLog('confirmPasswordAction called, passwordAction:', passwordAction);
            debugLog('Current pendingLockState:', pendingLockState);
            
            if (passwordAction === 'unlock') {
                // 解锁操作：验证密码
                const password = document.getElementById('passwordInput').value;
                
                if (!password) {
                    showToast(t('enterPassword'), 'warning');
                    return;
                }
                
                try {
                    const response = await fetch('/api/verifyPassword', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password })
                    });
                    const result = await response.json();
                    
                    if (result.code === 0 && result.valid) {
                        debugLog('Password verified, applying lock state:', pendingLockState);
                        const targetLockState = pendingLockState; // 保存 pendingLockState 的值
                        closePasswordModal();
                        await applyLockState(targetLockState);
                    } else {
                        showToast(result.message || t('passwordVerifyFailed'), 'error');
                    }
                } catch (error) {
                    console.error('Verify password error:', error);
                    showToast(t('passwordVerifyFailed'), 'error');
                }
            } else if (passwordAction === 'lock') {
                // 锁定操作
                debugLog('Lock action, hasPassword:', hasPassword);
                let newPassword = null;
                
                // 检查是否启用新密码
                const enableNewPassword = document.getElementById('enableNewPasswordCheckbox').checked;
                debugLog('enableNewPassword:', enableNewPassword);
                
                if (enableNewPassword) {
                    // 如果当前有密码，需要先验证旧密码
                    if (hasPassword) {
                        const oldPassword = document.getElementById('oldPasswordInput').value;
                        if (!oldPassword) {
                            showToast(t('enterPassword'), 'warning');
                            return;
                        }
                        
                        try {
                            const response = await fetch('/api/verifyPassword', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ password: oldPassword })
                            });
                            const result = await response.json();
                            
                            if (result.code !== 0 || !result.valid) {
                                showToast(t('oldPasswordIncorrect'), 'error');
                                return;
                            }
                            debugLog('Old password verified successfully');
                        } catch (error) {
                            console.error('Verify old password error:', error);
                            showToast(t('passwordVerifyFailed'), 'error');
                            return;
                        }
                    }
                    
                    const newPwd = document.getElementById('newPasswordInput').value;
                    const confirmPwd = document.getElementById('confirmPasswordInput').value;
                    
                    // 新密码可以为空（表示清除密码）
                    if (newPwd !== confirmPwd) {
                        showToast(t('passwordsNotMatch'), 'error');
                        return;
                    }
                    
                    newPassword = newPwd; // 可以是空字符串
                    debugLog('New password set (can be empty):', newPassword ? 'has value' : 'empty (will clear password)');
                }
                
                debugLog('Closing modal and applying lock state:', pendingLockState, 'newPassword:', newPassword);
                const targetLockState = pendingLockState; // 保存 pendingLockState 的值
                closePasswordModal();
                await applyLockState(targetLockState, newPassword);
                debugLog('applyLockState completed');
            }
        }
        
        // 页面加载读取数据
        window.onload = async function() {
            await loadConstants();
            // 加载系统配置（包括锁定状态）
            await loadSystemConfig();
            // 先加载 Tabs，确保 currentTabId 被正确初始化
            await loadTabs();
            loadTitle();
            loadLinks();
            applyLanguage(); // 应用语言设置
        };

        // 加载常量配置
        async function loadConstants() {
            try {
                debugLog('Loading constants from API...');
                const response = await fetch('/api/getConstants');
                debugLog('Response status:', response.status);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const result = await response.json();
                debugLog('API result:', result);
                
                if (result.code !== 0) {
                    throw new Error(result.message || 'Failed to get constants');
                }
                
                const constants = {
                    version: result.version,
                    copyright: result.copyright
                };
                debugLog('Constants loaded:', constants);
                
                // 更新页脚版权信息
                const footer = document.querySelector('.footer');
                debugLog('Footer element:', footer);
                
                if (footer && constants.version && constants.copyright) {
                    // 只显示版权信息，不显示版本号
                    footer.textContent = constants.copyright;
                    debugLog('Footer updated');
                } else {
                    console.warn('Missing version or copyright in constants');
                }
            } catch (error) {
                console.error('Failed to load constants:', error);
                // 如果加载失败，使用默认值
                const footer = document.querySelector('.footer');
                if (footer) {
                    footer.textContent = '(c) DSH-MyBookmark v1.0.0';
                    debugLog('Using default footer text');
                }
            }
        }

        // 加载系统配置（包括锁定状态）
        async function loadSystemConfig() {
            try {
                const response = await fetch('/api/getSystemConfig');
                const result = await response.json();
                
                if (result.code === 0) {
                    // 恢复锁定状态
                    hasPassword = result.hasPassword || false;
                    
                    // 加载调试模式状态
                    isDebugMode = result.debug === true || result.debug === 'true';
                    debugLog('Debug mode loaded:', isDebugMode);
                    
                    if (result.locked === true) {
                        isLockMode = true;
                        const lockBtn = document.getElementById('lockBtn');
                        const importBtn = document.getElementById('importBtn');
                        
                        // 更新按钮状态
                        lockBtn.textContent = '🔒';
                        lockBtn.setAttribute('data-i18n-title', 'unlockMode');
                        lockBtn.title = t('unlockMode');
                        importBtn.disabled = true;
                        importBtn.style.opacity = '0.5';
                        importBtn.style.cursor = 'not-allowed';
                    }
                }
            } catch (error) {
                console.error('Failed to load system config:', error);
            }
        }

        let currentEditId = null;
        let draggedElement = null;
        let draggedLinkId = null; // 保存被拖动的站点 ID
        let currentIconSize = localStorage.getItem('iconSize') || 'medium';
        let currentTabId = localStorage.getItem('currentTabId') || null;
        let draggedTabElement = null;
        let movingLinkId = null;
        let nextTabNumber = 2; // Tab 序号计数器
        let confirmCallback = null;
        let promptCallback = null;
        let isLockMode = false; // 锁定模式状态
        let hasPassword = false; // 是否设置了密码
        let passwordAction = null; // 当前密码操作类型：'lock' 或 'unlock'
        let pendingLockState = false; // 待处理的锁定状态
        let isDebugMode = false; // 调试模式状态

        // 调试日志函数 - 只有在开启调试模式时才输出日志
        function debugLog(...args) {
            if (isDebugMode) {
                console.log(...args);
            }
        }

        // 生成随机 ID（16位十六进制字符串）
        function generateRandomId() {
            return Math.random().toString(16).substring(2, 18);
        }

        // 读取列表
        async function loadLinks() {
            const res = await fetch('/api/get');
            const data = await res.json();
            
            // 从 localStorage 获取 currentTabId
            const tabId = localStorage.getItem('currentTabId');
            let list = [];
            
            if (tabId && data.tabs) {
                const currentTab = data.tabs.find(t => t.id === tabId);
                if (currentTab) {
                    list = currentTab.links || [];
                }
            }
            
            // iconSize 已经从 localStorage 初始化，不需要从服务器获取
            
            // 更新按钮状态
            updateIconSizeButtons();
            
            const el = document.getElementById('linkList');
            if (list.length === 0) {
                el.innerHTML = '<div class="empty" data-i18n="noBookmarks">' + t('noBookmarks') + '</div>';
                return;
            }
            let html = '';
            list.forEach(item => {
                const favicon = getFaviconUrl(item);
                debugLog('Loading favicon for:', item.name, '(ID:', item.id, ')', '->', favicon);
                const iconClass = currentIconSize === 'small' ? 'small' : currentIconSize;
                const smallIconMode = currentIconSize === 'small' ? 'small-icon-mode' : '';
                const noIconClass = ''; // 不再使用 no-icon 类
                const isCardLocked = item.locked === true; // 检查卡片是否单独锁定
                const isLocked = isLockMode || isCardLocked; // 全局锁定模式或卡片单独锁定
                
                if (currentIconSize === 'small') {
                    // 小图标模式：横向布局
                    html += `
                    <div class="link-card ${smallIconMode} ${isLocked ? 'locked' : ''}" draggable="${!isLocked}" data-id="${item.id}" 
                         ondragstart="handleDragStart(event)" 
                         ondragend="handleDragEnd(event)"
                         ondragover="handleDragOver(event)"
                         ondrop="handleDrop(event)">
                        ${!isLocked ? `<button class="move-btn-icon" onclick="showMoveToTabModal('${item.id}')" title="${t('moveToOtherTab')}">⇄</button>` : ''}
                        ${!isLocked ? `<button class="lock-btn-icon" onclick="toggleLockCard('${item.id}', true)" title="${t('lockCard')}">🔓</button>` : ''}
                        ${isLocked ? `<button class="unlock-btn-icon" onclick="toggleLockCard('${item.id}', false)" title="${t('unlockCard')}">🔒</button>` : ''}
                        <div class="link-icon ${iconClass}" style="background-size: cover; background-position: center; cursor: pointer;" onclick="openWebsite('${item.url}')" title="${item.name}">
                            <img src="${favicon}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">
                        </div>
                        <div class="card-content">
                            <div class="link-name" onclick="openWebsite('${item.url}')" title="${item.url}">${item.name}</div>
                            <div class="link-url" title="${item.url}"><a href="${item.url}" target="_blank" onclick="event.preventDefault();openWebsite('${item.url}')">${item.url}</a></div>
                            ${item.note ? `<div class="link-note">${item.note}</div>` : ''}
                        </div>
                        ${!isLocked ? `
                        <div class="card-actions">
                            <button class="card-btn edit-btn" onclick="openEditModal('${item.id}')" title="${t('editButton')}">✏️</button>
                            <button class="card-btn del-btn" onclick="delLink('${item.id}')" title="${t('deleteButton')}">🗑️</button>
                            <button class="card-btn refresh-btn" onclick="refreshFavicon('${item.id}')" title="${t('refreshIcon')}">⟳</button>
                        </div>
                        ` : ''}
                    </div>`;
                } else {
                    // 大/中图标模式：纵向布局
                    html += `
                    <div class="link-card ${isLocked ? 'locked' : ''}" draggable="${!isLocked}" data-id="${item.id}" 
                         ondragstart="handleDragStart(event)" 
                         ondragend="handleDragEnd(event)"
                         ondragover="handleDragOver(event)"
                         ondrop="handleDrop(event)">
                        ${!isLocked ? `<button class="move-btn-icon" onclick="showMoveToTabModal('${item.id}')" title="${t('moveToOtherTab')}">⇄</button>` : ''}
                        ${!isLocked ? `<button class="lock-btn-icon" onclick="toggleLockCard('${item.id}', true)" title="${t('lockCard')}">🔓</button>` : ''}
                        ${isLocked ? `<button class="unlock-btn-icon" onclick="toggleLockCard('${item.id}', false)" title="${t('unlockCard')}">🔒</button>` : ''}
                        <div class="link-icon ${iconClass}" style="background-size: cover; background-position: center; cursor: pointer;" onclick="openWebsite('${item.url}')" title="${item.name}">
                            <img src="${favicon}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">
                        </div>
                        <div class="link-name" onclick="openWebsite('${item.url}')" title="${item.url}">${item.name}</div>
                        <div class="link-url" title="${item.url}"><a href="${item.url}" target="_blank" onclick="event.preventDefault();openWebsite('${item.url}')">${item.url}</a></div>
                        ${item.note ? `<div class="link-note">${item.note}</div>` : ''}
                        ${!isLocked ? `
                        <div class="card-actions">
                            <button class="card-btn edit-btn" onclick="openEditModal('${item.id}')" title="${t('editButton')}">✏️</button>
                            <button class="card-btn del-btn" onclick="delLink('${item.id}')" title="${t('deleteButton')}">🗑️</button>
                            <button class="card-btn refresh-btn" onclick="refreshFavicon('${item.id}')" title="${t('refreshIcon')}">⟳</button>
                        </div>
                        ` : ''}
                    </div>`;
                }
            });
            el.innerHTML = html;
            
            // 延迟5秒后刷新 favicon（通过重新设置 src 触发浏览器重新请求）
            setTimeout(() => {
                debugLog('Refreshing favicons after 5 seconds...');
                list.forEach(item => {
                    const card = document.querySelector(`.link-card[data-id="${item.id}"]`);
                    if (card) {
                        const imgElement = card.querySelector('.link-icon img');
                        if (imgElement) {
                            // 重新生成带新时间戳的 URL，触发浏览器重新请求
                            const newFaviconUrl = getFaviconUrl(item);
                            imgElement.src = newFaviconUrl;
                            debugLog('Refreshed favicon for:', item.name, '->', newFaviconUrl);
                        }
                    }
                });
            }, 5000);
        }

        // 加载 Tabs
        async function loadTabs() {
            const res = await fetch('/api/get');
            const data = await res.json();
            let tabs = data.tabs || [{ id: generateRandomId(), name: '我的常用站点', links: [] }];
            
            // 根据当前语言转换默认 tab 名称
            tabs = tabs.map(tab => {
                if (tab.name === '我的常用站点' && currentLanguage === 'en') {
                    return { ...tab, name: t('defaultTabName') };
                } else if (tab.name === 'My Favorite Sites' && currentLanguage === 'zh') {
                    return { ...tab, name: t('defaultTabName') };
                }
                return tab;
            });
            
            // 如果没有当前选中的 tab，选中第一个并保存到 localStorage
            if (!currentTabId || !tabs.find(t => t.id === currentTabId)) {
                // 如果 currentTabId 为空，或者当前 ID 对应的 tab 不存在（比如首次打开时 default tab）
                currentTabId = tabs[0].id;
                localStorage.setItem('currentTabId', currentTabId);
                debugLog('Initialized currentTabId to:', currentTabId);
            }
            
            // 计算下一个 Tab 序号
            calculateNextTabNumber(tabs);
            
            renderTabs(tabs);
        }

        // 计算下一个 Tab 序号
        function calculateNextTabNumber(tabs) {
            let maxNum = 1;
            tabs.forEach(tab => {
                // 匹配中文格式：选项卡#数字
                const matchZh = tab.name.match(/^选项卡#(\d+)$/);
                // 匹配英文格式：Tab #数字
                const matchEn = tab.name.match(/^Tab #(\d+)$/);
                
                if (matchZh) {
                    const num = parseInt(matchZh[1]);
                    if (num > maxNum) {
                        maxNum = num;
                    }
                } else if (matchEn) {
                    const num = parseInt(matchEn[1]);
                    if (num > maxNum) {
                        maxNum = num;
                    }
                }
            });
            nextTabNumber = maxNum + 1;
        }

        // 渲染 Tabs
        function renderTabs(tabs) {
            const header = document.getElementById('tabHeader');
            let html = '';
            
            tabs.forEach((tab, index) => {
                const activeClass = tab.id === currentTabId ? 'active' : '';
                const activeIcon = tab.id === currentTabId ? '<span class="tab-active-icon">●</span>' : '';
                const closeBtn = tabs.length > 1 ? `<span class="tab-close" onclick="deleteTab('${tab.id}', event)">×</span>` : '';
                const siteCount = tab.links ? tab.links.length : 0;
                html += `
                    <div class="tab-item ${activeClass}" draggable="${!isLockMode}" data-tab-id="${tab.id}"
                         ondragstart="handleTabDragStart(event)"
                         ondragend="handleTabDragEnd(event)"
                         ondragover="handleTabDragOver(event)"
                         ondrop="handleTabDrop(event)"
                         ondragenter="handleTabDragEnter(event)"
                         ondragleave="handleTabDragLeave(event)">
                        ${activeIcon}<span class="tab-name" id="tab-name-${tab.id}" title="${t('doubleClickToEdit')}">${tab.name}</span>
                        <span class="tab-count">(${siteCount})</span>
                        ${closeBtn}
                    </div>
                `;
            });
            
            html += `<button class="add-tab-btn" onclick="addTab()">+ ${t('addTabButton')}</button>`;
            header.innerHTML = html;
            
            // 为每个 Tab 绑定事件
            tabs.forEach(tab => {
                const tabElement = document.querySelector(`.tab-item[data-tab-id="${tab.id}"]`);
                const nameElement = document.getElementById(`tab-name-${tab.id}`);
                
                if (tabElement && nameElement) {
                    let clickTimer = null;
                    
                    // 使用延迟处理单击/双击
                    tabElement.addEventListener('click', function(e) {
                        if (e.target.classList.contains('tab-close')) return;
                        
                        if (clickTimer) {
                            // 已经有一次点击，这是双击
                            clearTimeout(clickTimer);
                            clickTimer = null;
                            e.stopPropagation();
                            startEditTabName(tab.id, nameElement);
                        } else {
                            // 第一次点击，等待看是否有第二次点击
                            clickTimer = setTimeout(() => {
                                clickTimer = null;
                                switchTab(tab.id);
                            }, 250); // 250ms 内再次点击算双击
                        }
                    });
                }
            });
        }

        // 开始编辑 Tab 名称
        function startEditTabName(tabId, element) {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            const currentName = element.textContent;
            
            // 创建容器
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.gap = '4px';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'tab-name-input';
            input.value = currentName;
            input.style.flex = '1';
            
            // 创建取消按钮
            const cancelBtn = document.createElement('button');
            cancelBtn.innerHTML = '×';
            cancelBtn.style.cssText = 'background: #e53e3e;color: white;border: none;border-radius: 3px;width: 20px;height: 20px;cursor: pointer;font-size: 14px;display: flex;align-items: center;justify-content: center;padding: 0;line-height: 1;flex-shrink: 0;';
            
            container.appendChild(input);
            container.appendChild(cancelBtn);
            
            // 阻止事件冒泡，避免触发 Tab 切换
            container.addEventListener('click', (e) => e.stopPropagation());
            container.addEventListener('dblclick', (e) => e.stopPropagation());
            
            element.replaceWith(container);
            input.focus();
            input.select();
            
            let isCancelled = false;
            
            // 失去焦点或按回车时保存
            const saveEdit = () => {
                if (isCancelled) return;
                
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    updateTabName(tabId, newName);
                } else if (!newName) {
                    // 如果名称为空，恢复原名称
                    showToast(t('tabNameCannotEmpty'), 'warning');
                    isCancelled = true;
                    container.replaceWith(createTabNameElement(currentName, tabId));
                } else {
                    // 名称未改变，恢复原样
                    isCancelled = true;
                    container.replaceWith(createTabNameElement(currentName, tabId));
                }
            };
            
            // 点击取消按钮
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isCancelled = true;
                container.replaceWith(createTabNameElement(currentName, tabId));
            });
            
            input.addEventListener('blur', () => {
                setTimeout(saveEdit, 100); // 延迟执行，让取消按钮点击先处理
            });
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    saveEdit();
                }
            });
            
            // 按ESC取消
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    isCancelled = true;
                    container.replaceWith(createTabNameElement(currentName, tabId));
                }
            });
        }

        // 创建 Tab 名称元素
        function createTabNameElement(name, tabId) {
            const span = document.createElement('span');
            span.className = 'tab-name';
            span.textContent = name;
            if (!isLockMode) {
                span.setAttribute('ondblclick', `startEditTabName('${tabId}', this)`);
            }
            return span;
        }

        // 更新 Tab 名称
        async function updateTabName(tabId, newName) {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            try {
                await fetch('/api/updateTabName', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tabId, name: newName })
                });
                loadTabs();
            } catch (error) {
                console.error('Update tab name error:', error);
                showToast(t('updateTabNameFailed'), 'error');
            }
        }

        // 切换 Tab
        async function switchTab(tabId) {
            currentTabId = tabId;
            localStorage.setItem('currentTabId', tabId);
            await fetch('/api/switchTab', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabId })
            });
            loadLinks();
            loadTabs();
        }

        // 添加 Tab
        async function addTab() {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            const res = await fetch('/api/get');
            const data = await res.json();
            const tabs = data.tabs || [];
            
            // 检查是否已达到最大数量
            if (tabs.length >= 20) {
                showToast('最多只能创建20个选项卡', 'warning');
                return;
            }
            
            // 使用递增的序号作为默认名称，根据语言显示
            const defaultName = currentLanguage === 'zh' ? `选项卡#${nextTabNumber}` : `Tab #${nextTabNumber}`;
            
            customPrompt(t('enterTabName'), defaultName, async (name) => {
                if (!name || !name.trim()) return;
                
                try {
                    const response = await fetch('/api/addTab', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name.trim() })
                    });
                    
                    const result = await response.json();
                    
                    if (result.code === 0) {
                        // 自动切换到新tab并保存到 localStorage
                        currentTabId = result.tabId;
                        localStorage.setItem('currentTabId', result.tabId);
                        
                        // 如果使用的是默认名称，增加序号
                        const zhDefaultName = `选项卡#${nextTabNumber}`;
                        const enDefaultName = `Tab #${nextTabNumber}`;
                        if (name.trim() === zhDefaultName || name.trim() === enDefaultName) {
                            nextTabNumber++;
                        } else {
                            // 如果用户自定义了名称，重新计算序号
                            const res = await fetch('/api/get');
                            const data = await res.json();
                            calculateNextTabNumber(data.tabs || []);
                        }
                        
                        // 切换到新 Tab
                        if (result.tabId) {
                            currentTabId = result.tabId;
                        }
                        
                        // 重新加载 Tabs 和 Links
                        await loadTabs();
                        await loadLinks();
                        showToast(t('addTabSuccess'), 'success');
                    } else {
                        showToast(result.message || t('addTabFailed'), 'error');
                    }
                } catch (error) {
                    console.error('Add tab error:', error);
                    showToast(t('addTabFailed'), 'error');
                }
            });
        }

        // 删除 Tab
        async function deleteTab(tabId, event) {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            event.stopPropagation();
            
            customConfirm(t('confirmDeleteTab'), async (confirmed) => {
                if (!confirmed) return;
                
                try {
                    const res = await fetch('/api/deleteTab', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tabId })
                    });
                    const result = await res.json();
                    
                    if (result.code === 0) {
                        // 如果删除的是当前tab，切换到第一个tab
                        const res = await fetch('/api/get');
                        const data = await res.json();
                        
                        if (currentTabId === tabId && data.tabs && data.tabs.length > 0) {
                            currentTabId = data.tabs[0].id;
                            localStorage.setItem('currentTabId', currentTabId);
                        }
                        
                        loadTabs();
                        loadLinks();
                        showToast(t('deleteTabSuccess'), 'success');
                    } else {
                        // 如果服务器返回了 messageKey，使用翻译；否则使用 message 或默认错误消息
                        let errorMessage;
                        if (result.messageKey) {
                            // 如果有额外的参数，传递给翻译函数
                            const params = result.linkCount !== undefined ? { count: result.linkCount } : {};
                            errorMessage = t(result.messageKey, params);
                        } else {
                            errorMessage = result.message || t('deleteTabFailed');
                        }
                        showToast(errorMessage, 'error');
                    }
                } catch (error) {
                    console.error('Delete tab error:', error);
                    showToast(t('deleteTabFailed'), 'error');
                }
            });
        }

        // Tab 拖拽功能
        function handleTabDragStart(event) {
            draggedTabElement = event.target.closest('.tab-item');
            if (!draggedTabElement) return;
            draggedTabElement.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
        }

        function handleTabDragEnd(event) {
            if (draggedTabElement) {
                draggedTabElement.classList.remove('dragging');
                document.querySelectorAll('.tab-item').forEach(tab => {
                    tab.classList.remove('drag-over');
                });
                draggedTabElement = null;
            }
        }

        function handleTabDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const tab = event.target.closest('.tab-item');
            if (tab && tab !== draggedTabElement) {
                tab.classList.add('drag-over');
            }
        }

        // 拖动进入选项卡
        function handleTabDragEnter(event) {
            event.preventDefault();
            const tab = event.target.closest('.tab-item');
            if (tab && draggedLinkId) {
                // 如果拖动的是站点卡片，高亮选项卡
                tab.style.background = '#bee3f8';
            }
        }

        // 拖动离开选项卡
        function handleTabDragLeave(event) {
            const tab = event.target.closest('.tab-item');
            if (tab) {
                tab.style.background = '';
            }
        }

        async function handleTabDrop(event) {
            event.preventDefault();
            const targetTab = event.target.closest('.tab-item');
            
            // 重置样式
            document.querySelectorAll('.tab-item').forEach(tab => {
                tab.style.background = '';
            });
            
            if (!targetTab) {
                return;
            }
            
            const targetTabId = targetTab.dataset.tabId; // Tab ID 可能是字符串或数字
            
            // 如果拖动的是站点卡片
            if (draggedLinkId) {
                // 不能移动到当前选项卡
                if (targetTabId === currentTabId) {
                    draggedLinkId = null;
                    return;
                }
                
                try {
                    const response = await fetch('/api/moveLinkToTab', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            linkId: draggedLinkId,
                            fromTabId: currentTabId,
                            toTabId: targetTabId
                        })
                    });
                    
                    const result = await response.json();
                    if (result.code === 0) {
                        showToast('站点已移动', 'success');
                        loadLinks();
                        loadTabs();
                    } else {
                        showToast(result.message || '移动失败', 'error');
                    }
                } catch (error) {
                    console.error('Move link error:', error);
                    showToast('移动失败：' + error.message, 'error');
                }
                
                draggedLinkId = null;
                return;
            }
            
            // 如果拖动的是选项卡（原有的逻辑）
            if (!draggedTabElement || targetTab === draggedTabElement) {
                return;
            }

            const header = document.getElementById('tabHeader');
            const tabs = Array.from(header.querySelectorAll('.tab-item'));
            
            const draggedIndex = tabs.indexOf(draggedTabElement);
            const targetIndex = tabs.indexOf(targetTab);

            if (draggedIndex === -1 || targetIndex === -1) {
                return;
            }

            // 重新排列DOM元素
            if (draggedIndex < targetIndex) {
                header.insertBefore(draggedTabElement, targetTab.nextSibling);
            } else {
                header.insertBefore(draggedTabElement, targetTab);
            }

            // 获取新的顺序并保存到服务器
            const newOrderTabs = Array.from(header.querySelectorAll('.tab-item'));
            const tabIds = newOrderTabs.map(tab => tab.dataset.tabId); // Tab ID 可能是字符串或数字
            
            try {
                await fetch('/api/updateTabOrder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tabIds })
                });
                debugLog('Tab order saved');
            } catch (error) {
                console.error('Save tab order error:', error);
                loadTabs();
            }
        }

        // 新增
        async function addLink() {
            const name = document.getElementById('linkName').value.trim();
            const url = document.getElementById('linkUrl').value.trim();
            if (!name || !url) {
                showToast(t('fillNameAndUrl'), 'warning');
                return;
            }
            await fetch('/api/add', {
                method: 'POST',
                body: JSON.stringify({ name, url, tabId: currentTabId })
            });
            document.getElementById('linkName').value = '';
            document.getElementById('linkUrl').value = '';
            loadLinks();
        }

        // 打开添加弹窗
        function openAddModal() {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            document.getElementById('addName').value = '';
            document.getElementById('addUrl').value = '';
            document.getElementById('addNote').value = ''; // 清空备注字段
            document.getElementById('addModal').style.display = 'flex';
        }

        // 关闭添加弹窗
        function closeAddModal() {
            document.getElementById('addModal').style.display = 'none';
        }

        // 自动填充名称
        async function autoFillName() {
            const url = document.getElementById('addUrl').value.trim();
            const nameInput = document.getElementById('addName');
            // 只有当名称为空时才自动填充
            if (url && !nameInput.value.trim()) {
                // 使用域名作为名称
                const extractedName = extractNameFromUrl(url);
                if (extractedName) {
                    nameInput.value = extractedName;
                }
            }
        }

        // 确保URL有协议前缀
        function ensureUrlProtocol(url) {
            if (!url) return url;
            const trimmed = url.trim();
            // 如果已包含 :// 协议标识，直接返回
            if (trimmed.includes('://')) {
                return trimmed;
            }
            // 如果没有协议，在最前面添加 https://
            return 'https://' + trimmed;
        }

        // 打开网站 - 根据协议类型区分处理方式
        function openWebsite(url) {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                // http/https 协议，在新标签页打开
                window.open(url, '_blank');
            } else if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('brave://') || url.startsWith('opera://')) {
                // 浏览器内部协议，无法通过 JS 直接打开，复制到剪贴板
                navigator.clipboard.writeText(url).then(() => {
                    showToast(t('browserProtocolCopied'), 'info', 5000);
                }).catch(() => {
                    // 剪贴板 API 失败时，显示提示
                    showToast(t('browserProtocolCopied') + ': ' + url, 'warning', 8000);
                });
            } else {
                // 其他协议，在当前标签页导航
                window.location.href = url;
            }
        }

        // 保存添加的链接
        async function saveAddLink() {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            let name = document.getElementById('addName').value.trim();
            let url = document.getElementById('addUrl').value.trim();
            const note = document.getElementById('addNote').value.trim();
            
            if (!url) {
                showToast(t('fillUrl'), 'warning');
                return;
            }
            
            // 确保URL有协议
            url = ensureUrlProtocol(url);
            
            // 如果名称为空，不提取，让后端自动获取
            // 后端会从网站标题中提取，如果失败则使用域名
            
            // 设置 loading 状态
            const addBtn = document.getElementById('addBtn');
            const originalText = addBtn.textContent;
            addBtn.classList.add('loading');
            addBtn.disabled = true;
            
            try {
                const response = await fetch('/api/add', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, url, note, tabId: currentTabId })
                });
                const result = await response.json();
                
                // 检查是否网站已存在
                if (response.status === 409 || result.code === 1) {
                    showToast(result.message || t('websiteExists'), 'warning');
                    addBtn.classList.remove('loading');
                    addBtn.disabled = false;
                    return;
                }
                
                closeAddModal();
                loadLinks();
                
                // 显示使用的名称
                if (result.name && result.name !== name) {
                    showToast(`${t('addSuccess')} - ${result.name}`, 'success');
                } else {
                    showToast(t('addSuccess'), 'success');
                }
            } catch (error) {
                console.error('Add link error:', error);
                showToast(t('addFailed') + error.message, 'error');
            } finally {
                // 移除 loading 状态
                addBtn.classList.remove('loading');
                addBtn.disabled = false;
            }
        }

        // 删除
        async function delLink(id) {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            customConfirm(t('deleteConfirm'), async (confirmed) => {
                if (!confirmed) return;
                await fetch('/api/del', {
                    method: 'POST',
                    body: JSON.stringify({ id, tabId: currentTabId })
                });
                loadLinks();
                showToast(t('deleteSuccess'), 'success');
            });
        }

        // 获取网站favicon - 使用 ID 作为参数，添加时间戳避免缓存
        function getFaviconUrl(item) {
            try {
                // 返回 API 地址，使用 tabId 和 linkId 作为参数，添加时间戳
                const timestamp = Date.now();
                const faviconUrl = `/api/favicon/${currentTabId}/${item.id}?_ts=${timestamp}`;
                debugLog('Favicon URL for', item.name, '(ID:', item.id, '):', faviconUrl);
                return faviconUrl;
            } catch (e) {
                console.error('Error generating favicon URL:', e);
                return '/website.png';
            }
        }

        // 检查是否有favicon
        function hasFavicon(url) {
            return url && url.length > 0;
        }

        // 从 URL 提取网站名称
        function extractNameFromUrl(url) {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname;
                // 去除 www. 前缀
                const name = hostname.replace(/^www\./, '');
                // 取第一个部分作为名称
                const parts = name.split('.');
                return parts[0] || name;
            } catch {
                return '';
            }
        }

        // 打开编辑弹窗
        async function openEditModal(id) {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            currentEditId = id;
            const res = await fetch('/api/get');
            const data = await res.json();
            
            // 从 tabs 中查找当前 Tab 的 links
            let item = null;
            if (currentTabId && data.tabs) {
                const currentTab = data.tabs.find(t => t.id === currentTabId);
                if (currentTab) {
                    item = currentTab.links.find(i => i.id === id);
                }
            }
            
            if (item) {
                document.getElementById('editName').value = item.name;
                document.getElementById('editUrl').value = item.url;
                document.getElementById('editNote').value = item.note || '';
                document.getElementById('editModal').style.display = 'flex';
            } else {
                showToast(t('bookmarkNotFound'), 'error');
            }
        }

        // 关闭编辑弹窗
        function closeEditModal() {
            document.getElementById('editModal').style.display = 'none';
            currentEditId = null;
        }

        // 保存编辑
        async function saveEdit() {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            let name = document.getElementById('editName').value.trim();
            let url = document.getElementById('editUrl').value.trim();
            const note = document.getElementById('editNote').value.trim();
            
            if (!url) {
                showToast(t('fillUrl'), 'warning');
                return;
            }
            
            // 确保URL有协议
            url = ensureUrlProtocol(url);

            // 如果名称为空，不提取，让后端自动获取
            // 后端会从网站标题中提取，如果失败则使用域名
            
            // 设置 loading 状态
            const editBtn = document.getElementById('editBtn');
            editBtn.classList.add('loading');
            editBtn.disabled = true;
            
            try {
                const response = await fetch('/api/update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: currentEditId, name, url, note, tabId: currentTabId })
                });
                const result = await response.json();
                debugLog('Update result:', result);
                if (result.code === 0) {
                    closeEditModal();
                    loadLinks();
                    
                    // 显示使用的名称
                    if (result.name && result.name !== name) {
                        showToast(`${t('saveSuccess')} - ${result.name}`, 'success');
                    } else {
                        showToast(t('saveSuccess'), 'success');
                    }
                } else {
                    showToast(t('saveFailed') + (result.message || t('unknownError')), 'error');
                }
            } catch (error) {
                console.error('Save error:', error);
                showToast(t('saveError') + error.message, 'error');
            } finally {
                // 移除 loading 状态
                editBtn.classList.remove('loading');
                editBtn.disabled = false;
            }
        }

        // 同步读取数据（用于编辑时获取当前值）
        function readDataSync() {
            // 这里需要从服务器获取，简化处理：从DOM中获取不太准确，所以还是用异步
            // 实际应该在openEditModal时就已获取
            return [];
        }

        // 加载标题
        async function loadTitle() {
            try {
                const res = await fetch('/api/get');
                const data = await res.json();
                debugLog('loadTitle - API response:', { title: data.title, customTitle: data.customTitle });
                if (data.title) {
                    // 如果用户已自定义标题（customTitle === true），直接使用保存的标题，不进行语言切换
                    let displayTitle = data.title;
                    debugLog('loadTitle - customTitle check:', data.customTitle);
                    if (!data.customTitle) {
                        // 只有未自定义时，才根据语言自动切换默认标题
                        debugLog('loadTitle - Auto-switching title based on language');
                        if (data.title === '我的收藏夹' && currentLanguage === 'en') {
                            displayTitle = t('defaultTitle');
                            debugLog('loadTitle - Switched to English:', displayTitle);
                        } else if (data.title === 'My Bookmark' && currentLanguage === 'zh') {
                            displayTitle = t('defaultTitle');
                            debugLog('loadTitle - Switched to Chinese:', displayTitle);
                        }
                    } else {
                        debugLog('loadTitle - Using custom title (no auto-switch):', displayTitle);
                    }
                    const toolbarTitleEl = document.getElementById('toolbarTitle');
                    if (toolbarTitleEl) {
                        toolbarTitleEl.textContent = displayTitle;
                    }
                    // 同时更新页面 title 标签
                    document.title = displayTitle;
                    debugLog('loadTitle - Final title set to:', displayTitle);
                }
            } catch (error) {
                console.error('Load title error:', error);
                // 如果失败，尝试从localStorage读取
                const savedTitle = localStorage.getItem('siteTitle');
                if (savedTitle) {
                    const toolbarTitleEl = document.getElementById('toolbarTitle');
                    if (toolbarTitleEl) {
                        toolbarTitleEl.textContent = savedTitle;
                    }
                    document.title = savedTitle;
                }
            }
        }

        // 拖拽功能
        function handleDragStart(event) {
            draggedElement = event.target.closest('.link-card');
            if (draggedElement) {
                draggedLinkId = draggedElement.dataset.id; // ID 现在是字符串，不需要 parseInt
                draggedElement.classList.add('dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/html', draggedElement.innerHTML);
            }
        }

        function handleDragEnd(event) {
            if (draggedElement) {
                draggedElement.classList.remove('dragging');
                // 移除所有drag-over类
                document.querySelectorAll('.link-card').forEach(card => {
                    card.classList.remove('drag-over');
                });
                draggedElement = null;
                draggedLinkId = null;
            }
        }

        function handleDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const card = event.target.closest('.link-card');
            if (card && card !== draggedElement) {
                card.classList.add('drag-over');
            }
        }

        async function handleDrop(event) {
            event.preventDefault();
            const targetCard = event.target.closest('.link-card');
            
            if (!targetCard || !draggedElement || targetCard === draggedElement) {
                return;
            }

            // 获取所有卡片的ID顺序
            const grid = document.getElementById('linkList');
            const cards = Array.from(grid.querySelectorAll('.link-card'));
            
            // 找到拖动元素和目标元素的位置
            const draggedIndex = cards.indexOf(draggedElement);
            const targetIndex = cards.indexOf(targetCard);

            if (draggedIndex === -1 || targetIndex === -1) {
                return;
            }

            // 重新排列DOM元素
            if (draggedIndex < targetIndex) {
                grid.insertBefore(draggedElement, targetCard.nextSibling);
            } else {
                grid.insertBefore(draggedElement, targetCard);
            }

            // 获取新的顺序并保存到服务器
            const newOrderCards = Array.from(grid.querySelectorAll('.link-card'));
            const linkIds = newOrderCards.map(card => card.dataset.id); // ID 现在是字符串
            
            try {
                await fetch('/api/updateOrder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ linkIds, tabId: currentTabId })
                });
                debugLog('Order saved to server');
            } catch (error) {
                console.error('Save order error:', error);
                // 如果保存失败，重新加载列表恢复原状
                loadLinks();
            }
        }

        // 设置图标大小
        async function setIconSize(size) {
            currentIconSize = size;
            localStorage.setItem('iconSize', size);
            
            try {
                await fetch('/api/updateIconSize', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ iconSize: size })
                });
                debugLog('Icon size changed to:', size);
                updateIconSizeButtons();
                loadLinks(); // 重新加载以应用新样式
                showToast(t('iconSizeChanged'), 'success');
            } catch (error) {
                console.error('Change icon size error:', error);
                showToast(t('changeIconSizeFailed'), 'error');
            }
        }

        // 更新图标大小按钮状态
        function updateIconSizeButtons() {
            // 移除所有按钮的active类
            document.querySelectorAll('.icon-size-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // 给当前选中的按钮添加active类
            const activeBtnId = 'btn' + currentIconSize.charAt(0).toUpperCase() + currentIconSize.slice(1);
            const activeBtn = document.getElementById(activeBtnId);
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
        }

        // 导出数据 - 打开选择框
        async function exportData() {
            try {
                const res = await fetch('/api/get');
                const data = await res.json();
                const tabs = data.tabs || [];
                
                // 填充文件导出选项卡列表
                const select = document.getElementById('exportScopeSelect');
                select.innerHTML = `<option value="all" data-i18n="exportAllOption">${t('exportAllOption')}</option>`;
                
                tabs.forEach(tab => {
                    const option = document.createElement('option');
                    option.value = tab.id;
                    const siteCount = tab.links ? tab.links.length : 0;
                    option.textContent = t('exportSingleOption', { name: tab.name, count: siteCount });
                    select.appendChild(option);
                });
                
                // 填充文本导出选项卡列表
                const selectText = document.getElementById('exportScopeSelectText');
                selectText.innerHTML = `<option value="all" data-i18n="exportAllOption">${t('exportAllOption')}</option>`;
                
                tabs.forEach(tab => {
                    const option = document.createElement('option');
                    option.value = tab.id;
                    const siteCount = tab.links ? tab.links.length : 0;
                    option.textContent = t('exportSingleOption', { name: tab.name, count: siteCount });
                    selectText.appendChild(option);
                });
                
                // 设置两个下拉框为共享的状态
                select.value = exportScope;
                selectText.value = exportScope;
                
                const formatSelect = document.getElementById('exportFormatSelect');
                formatSelect.value = exportFormat;
                
                const formatSelectText = document.getElementById('exportFormatSelectText');
                formatSelectText.value = exportFormat;
                
                // 初始化格式选项状态
                updateExportFormatOptions();
                updateTextExportFormatOptions();
                
                // 重置为文件导出方式
                setExportMethod('file');
                
                // 清空文本框内容
                document.getElementById('exportContentArea').value = '';
                document.getElementById('exportContentInfo').textContent = '';
                
                document.getElementById('exportModal').style.display = 'flex';
            } catch (error) {
                console.error('Get data error:', error);
                showToast('获取数据失败', 'error');
            }
        }
        
        // 设置导出方式
        function setExportMethod(method) {
            currentExportMethod = method;
            
            const fileBtn = document.getElementById('exportMethodFileBtn');
            const textBtn = document.getElementById('exportMethodTextBtn');
            const fileSection = document.getElementById('fileExportSection');
            const textSection = document.getElementById('textExportSection');
            const fileButtons = document.getElementById('fileExportButtons');
            const textButtons = document.getElementById('textExportButtons');
            
            if (method === 'file') {
                // 显示文件导出区域
                fileBtn.style.background = '#4299e1';
                fileBtn.style.color = 'white';
                textBtn.style.background = '#e2e8f0';
                textBtn.style.color = '#4a5568';
                fileSection.style.display = 'block';
                textSection.style.display = 'none';
                fileButtons.style.display = 'flex';
                textButtons.style.display = 'none';
            } else {
                // 显示文本导出区域
                textBtn.style.background = '#4299e1';
                textBtn.style.color = 'white';
                fileBtn.style.background = '#e2e8f0';
                fileBtn.style.color = '#4a5568';
                textSection.style.display = 'block';
                fileSection.style.display = 'none';
                textButtons.style.display = 'flex';
                fileButtons.style.display = 'none';
                
                // 自动生成导出内容
                generateExportContent();
            }
        }
        
        // 更新文本导出格式选项
        function updateTextExportFormatOptions() {
            const scope = document.getElementById('exportScopeSelectText').value;
            const formatSelect = document.getElementById('exportFormatSelectText');
            const htmlOption = formatSelect.querySelector('option[value="html"]');
            
            // 更新共享状态
            exportScope = scope;
            exportFormat = formatSelect.value;
            
            // 同步到文件导出模式
            const fileScopeSelect = document.getElementById('exportScopeSelect');
            const fileFormatSelect = document.getElementById('exportFormatSelect');
            if (fileScopeSelect.querySelector(`option[value="${scope}"]`)) {
                fileScopeSelect.value = scope;
            }
            fileFormatSelect.value = formatSelect.value;
            
            if (scope === 'all') {
                // 选择全部数据时，禁用 HTML 格式
                htmlOption.disabled = true;
                formatSelect.value = 'json';
                fileFormatSelect.value = 'json';
                exportFormat = 'json';
            } else {
                // 选择单个选项卡时，启用 HTML 格式
                htmlOption.disabled = false;
            }
            
            // 重新生成内容
            generateExportContent();
        }
        
        // 生成导出内容到文本框
        async function generateExportContent() {
            const scope = document.getElementById('exportScopeSelectText').value;
            const format = document.getElementById('exportFormatSelectText').value;
            const contentArea = document.getElementById('exportContentArea');
            const infoSpan = document.getElementById('exportContentInfo');
            const copyBtn = document.getElementById('copyExportBtn');
            
            try {
                const res = await fetch('/api/get');
                const data = await res.json();
                
                let content = '';
                
                if (format === 'html') {
                    // Chrome书签 HTML 格式
                    let tabsToExport = [];
                    if (scope === 'all') {
                        tabsToExport = data.tabs;
                    } else {
                        const selectedTab = data.tabs.find(t => t.id === scope);
                        if (selectedTab) {
                            tabsToExport = [selectedTab];
                        }
                    }
                    content = generateChromeBookmarksHTML(tabsToExport);
                } else {
                    // JSON 格式
                    let exportData;
                    
                    if (scope === 'all') {
                        // 导出全部数据，包含 config.json
                        const configRes = await fetch('/api/getConfig');
                        const configData = await configRes.json();
                        
                        exportData = {
                            ...data,
                            config: {
                                port: configData.port,
                                copyright: configData.copyright
                            }
                        };
                    } else {
                        // 导出单个选项卡
                        const tabId = scope;
                        const selectedTab = data.tabs.find(t => t.id === tabId);
                        
                        if (!selectedTab) {
                            contentArea.value = '未找到选中的选项卡';
                            infoSpan.textContent = '';
                            copyBtn.disabled = true;
                            return;
                        }
                        
                        exportData = {
                            tabs: [selectedTab]
                        };
                    }
                    
                    content = JSON.stringify(exportData, null, 2);
                }
                
                // 显示内容
                contentArea.value = content;
                
                // 显示信息
                const sizeKB = (content.length / 1024).toFixed(2);
                const formatName = format === 'json' ? 'JSON' : 'HTML';
                const infoText = t('generatedFormatSize').replace('{format}', formatName).replace('{size}', sizeKB);
                infoSpan.textContent = infoText;
                
                // 启用复制按钮
                copyBtn.disabled = false;
                copyBtn.style.opacity = '1';
                copyBtn.style.cursor = 'pointer';
                
            } catch (error) {
                console.error('Generate export content error:', error);
                contentArea.value = '生成内容失败：' + error.message;
                infoSpan.textContent = '';
                copyBtn.disabled = true;
            }
        }
        
        // 复制导出内容
        function copyExportContent() {
            const contentArea = document.getElementById('exportContentArea');
            const content = contentArea.value;
            
            if (!content) {
                showToast(t('noContentToCopy'), 'error');
                return;
            }
            
            // 使用 Clipboard API
            navigator.clipboard.writeText(content).then(() => {
                showToast(t('contentCopied'), 'success');
            }).catch(err => {
                console.error('Copy error:', err);
                // 降级方案：使用传统的 execCommand
                contentArea.select();
                contentArea.setSelectionRange(0, content.length);
                try {
                    document.execCommand('copy');
                    showToast(t('contentCopied'), 'success');
                } catch (e) {
                    showToast(t('copyFailed'), 'error');
                }
            });
        }

        // 关闭导出弹窗
        function closeExportModal() {
            document.getElementById('exportModal').style.display = 'none';
        }

        // 更新导出格式选项（根据选择的范围）
        function updateExportFormatOptions() {
            const scope = document.getElementById('exportScopeSelect').value;
            const formatSelect = document.getElementById('exportFormatSelect');
            const htmlOption = formatSelect.querySelector('option[value="html"]');
            const tipText = document.getElementById('exportTipText');
            
            // 更新共享状态
            exportScope = scope;
            exportFormat = formatSelect.value;
            
            // 同步到文本导出模式
            const textScopeSelect = document.getElementById('exportScopeSelectText');
            const textFormatSelect = document.getElementById('exportFormatSelectText');
            if (textScopeSelect.querySelector(`option[value="${scope}"]`)) {
                textScopeSelect.value = scope;
            }
            textFormatSelect.value = formatSelect.value;
            
            if (scope === 'all') {
                // 选择全部数据时，禁用 HTML 格式
                htmlOption.disabled = true;
                formatSelect.value = 'json';
                textFormatSelect.value = 'json';
                exportFormat = 'json';
                tipText.textContent = t('exportTip');
            } else {
                // 选择单个选项卡时，启用 HTML 格式
                htmlOption.disabled = false;
                tipText.textContent = t('exportFormatTip');
            }
        }

        // 格式化日期时间为 yyyyMMddHHmmss
        function formatDateTime(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}${month}${day}${hours}${minutes}${seconds}`;
        }

        // 确认导出
        async function confirmExport() {
            const scope = document.getElementById('exportScopeSelect').value;
            const format = document.getElementById('exportFormatSelect').value;
            
            try {
                const res = await fetch('/api/get');
                const data = await res.json();
                
                if (format === 'html') {
                    // Chrome书签 HTML 格式
                    await exportAsChromeHTML(data, scope);
                } else {
                    // JSON 格式（原有逻辑）
                    let exportData;
                    let filename;
                    
                    if (scope === 'all') {
                        // 导出全部数据，包含 config.json
                        const configRes = await fetch('/api/getConfig');
                        const configData = await configRes.json();
                        
                        exportData = {
                            ...data,
                            config: {
                                port: configData.port,
                                copyright: configData.copyright
                            }
                        };
                        filename = `mybookmark_full_backup_${formatDateTime(new Date())}.json`;
                    } else {
                        // 导出单个选项卡
                        const tabId = scope; // Tab ID 可能是字符串或数字
                        const selectedTab = data.tabs.find(t => t.id === tabId);
                        
                        if (!selectedTab) {
                            showToast('未找到选中的选项卡', 'error');
                            return;
                        }
                        
                        // 只包含该选项卡的内容，不包含 title、iconSize、currentTabId
                        exportData = {
                            tabs: [selectedTab]
                        };
                        filename = `mybookmark_${selectedTab.name}_${formatDateTime(new Date())}.json`;
                    }
                    
                    // 创建JSON文件
                    const jsonStr = JSON.stringify(exportData, null, 2);
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    
                    // 创建下载链接
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
                
                closeExportModal();
                debugLog('Data exported successfully');
                showToast(t('exportSuccess'), 'success');
            } catch (error) {
                console.error('Export error:', error);
                showToast(t('exportFailed') + error.message, 'error');
            }
        }

        // 导出为 Chrome HTML 格式
        async function exportAsChromeHTML(data, scope) {
            // 获取要导出的选项卡
            let tabsToExport = [];
            if (scope === 'all') {
                tabsToExport = data.tabs;
            } else {
                const selectedTab = data.tabs.find(t => t.id === scope);
                if (selectedTab) {
                    tabsToExport = [selectedTab];
                }
            }
            
            if (tabsToExport.length === 0) {
                showToast('没有可导出的数据', 'error');
                return;
            }
            
            // 生成 Chrome 书签 HTML
            const htmlContent = generateChromeBookmarksHTML(tabsToExport);
            
            // 创建文件名
            const timestamp = formatDateTime(new Date());
            let filename;
            if (scope === 'all') {
                filename = `chrome_bookmarks_all_${timestamp}.html`;
            } else {
                const tabName = tabsToExport[0].name.replace(/[\\/:*?"<>|]/g, '_');
                filename = `chrome_bookmarks_${tabName}_${timestamp}.html`;
            }
            
            // 创建并下载文件
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // 生成 Chrome 书签 HTML
        function generateChromeBookmarksHTML(tabs) {
            const now = new Date();
            const timestamp = Math.floor(now.getTime() / 1000);
            
            let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;
            
            tabs.forEach(tab => {
                // 直接使用选项卡名称作为根文件夹
                html += `    <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${escapeHtml(tab.name)}</H3>
    <DL><p>
`;
                
                if (tab.links && tab.links.length > 0) {
                    tab.links.forEach(link => {
                        const linkTimestamp = timestamp;
                        html += `        <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${linkTimestamp}">${escapeHtml(link.name)}</A>
`;
                    });
                }
                
                html += `    </DL><p>
`;
            });
            
            html += `</DL><p>
`;
            
            return html;
        }

        // HTML 转义
        function escapeHtml(text) {
            if (!text) return '';
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // 全局变量存储待导入的文件
        let pendingImportFile = null;
        
        // 当前导入方式 ('file' 或 'paste')
        let currentImportMethod = 'file';
        
        // 当前导出方式 ('file' 或 'text')
        let currentExportMethod = 'file';
        
        // 共享的导出状态
        let exportScope = 'all';
        let exportFormat = 'json';
        
        // 设置导入方式
        function setImportMethod(method) {
            currentImportMethod = method;
            
            const fileBtn = document.getElementById('importMethodFileBtn');
            const pasteBtn = document.getElementById('importMethodPasteBtn');
            const classicBtn = document.getElementById('importMethodClassicBtn');
            const fileSection = document.getElementById('fileImportSection');
            const pasteSection = document.getElementById('pasteImportSection');
            const classicSection = document.getElementById('classicImportSection');
            
            // 重置所有按钮样式
            fileBtn.style.background = '#e2e8f0';
            fileBtn.style.color = '#4a5568';
            pasteBtn.style.background = '#e2e8f0';
            pasteBtn.style.color = '#4a5568';
            classicBtn.style.background = '#e2e8f0';
            classicBtn.style.color = '#4a5568';
            
            // 隐藏所有区域
            fileSection.style.display = 'none';
            pasteSection.style.display = 'none';
            classicSection.style.display = 'none';
            
            if (method === 'file') {
                // 显示文件导入区域
                fileBtn.style.background = '#4299e1';
                fileBtn.style.color = 'white';
                fileSection.style.display = 'block';
                
                // 重置为第一个导入类型（mybookmark）
                document.querySelector('input[name="importType"][value="mybookmark"]').checked = true;
                
                // 隐藏选项卡选择框
                document.getElementById('unifiedImportTabSection').style.display = 'none';
                
                // 重置粘贴内容
                document.getElementById('pasteContentArea').value = '';
                document.getElementById('pasteContentPreview').style.display = 'none';
            } else if (method === 'paste') {
                // 显示粘贴内容区域
                pasteBtn.style.background = '#4299e1';
                pasteBtn.style.color = 'white';
                pasteSection.style.display = 'block';
                
                // 重置为第一个内容类型（mybookmark）
                document.querySelector('input[name="pasteType"][value="mybookmark"]').checked = true;
                
                // 隐藏选项卡选择框
                document.getElementById('unifiedImportTabSection').style.display = 'none';
                
                // 重置文件选择
                pendingImportFile = null;
                document.getElementById('importFile').value = '';
                document.getElementById('selectedFileName').style.display = 'none';
            } else if (method === 'classic') {
                // 显示经典收藏区域
                classicBtn.style.background = '#4299e1';
                classicBtn.style.color = 'white';
                classicSection.style.display = 'block';
                
                // 隐藏选项卡选择框
                document.getElementById('unifiedImportTabSection').style.display = 'none';
                
                // 重置分类选择
                document.getElementById('classicCategorySelect').value = '';
                
                // 隐藏预览区域
                document.getElementById('classicPreviewSection').style.display = 'none';
                
                // 加载主题分类列表
                loadClassicCategories();
            }
            
            // 禁用开始导入按钮，等待用户操作
            const startBtn = document.getElementById('startImportBtn');
            startBtn.disabled = true;
            startBtn.style.opacity = '0.5';
            startBtn.style.cursor = 'not-allowed';
        }
        
        // 处理粘贴类型变化
        function onPasteTypeChange() {
            const pasteType = document.querySelector('input[name="pasteType"]:checked').value;
            const tabSection = document.getElementById('unifiedImportTabSection');
            
            if (pasteType === 'chrome') {
                // 如果选择了 Chrome/Edge 书签，显示选项卡选择框
                loadUnifiedImportTabSelect();
            } else {
                // 否则隐藏选项卡选择框
                tabSection.style.display = 'none';
            }
            
            // 检查是否有内容
            checkPasteContent();
        }
        
        // 加载统一的导入选项卡选择列表
        async function loadUnifiedImportTabSelect() {
            const select = document.getElementById('unifiedImportTabSelect');
            const tabSection = document.getElementById('unifiedImportTabSection');
            const startBtn = document.getElementById('startImportBtn');
            
            try {
                const res = await fetch('/api/get');
                const data = await res.json();
                const tabs = data.tabs || [];
                
                if (tabs.length === 0) {
                    showToast('没有可用的选项卡', 'error');
                    tabSection.style.display = 'none';
                    startBtn.disabled = true;
                    startBtn.style.opacity = '0.5';
                    startBtn.style.cursor = 'not-allowed';
                    return;
                }
                
                // 获取当前选中的选项卡 ID
                const currentTabId = localStorage.getItem('currentTabId');
                
                // 填充选项卡列表
                select.innerHTML = '';
                tabs.forEach(tab => {
                    const option = document.createElement('option');
                    option.value = tab.id;
                    const siteCount = tab.links ? tab.links.length : 0;
                    option.textContent = `${tab.name} (${siteCount} ${t('sitesCount')})`;
                    
                    // 如果是当前激活的选项卡，设置为选中状态
                    if (tab.id === currentTabId) {
                        option.selected = true;
                    }
                    
                    select.appendChild(option);
                });
                
                // 如果没有找到匹配的选项卡（比如首次打开），默认选中第一个
                if (!select.value && tabs.length > 0) {
                    select.value = tabs[0].id;
                }
                
                // 显示选项卡选择区域
                tabSection.style.display = 'block';
                
                // 启用开始导入按钮
                startBtn.disabled = false;
                startBtn.style.opacity = '1';
                startBtn.style.cursor = 'pointer';
            } catch (error) {
                console.error('Load tabs for unified import error:', error);
                showToast('加载选项卡失败', 'error');
                tabSection.style.display = 'none';
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.style.cursor = 'not-allowed';
            }
        }
        
        // 检查粘贴内容
        function checkPasteContent() {
            const content = document.getElementById('pasteContentArea').value.trim();
            const previewDiv = document.getElementById('pasteContentPreview');
            const startBtn = document.getElementById('startImportBtn');
            const pasteType = document.querySelector('input[name="pasteType"]:checked').value;
            
            if (content.length === 0) {
                previewDiv.style.display = 'none';
                
                // 禁用开始导入按钮
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.style.cursor = 'not-allowed';
                return;
            }
            
            // 根据类型进行格式校验
            let isValid = false;
            let errorMsg = '';
            
            if (pasteType === 'mybookmark') {
                // 校验 JSON 格式
                try {
                    const parsed = JSON.parse(content);
                    
                    // 检查是否有 tabs 数组（必需）
                    if (!parsed.tabs || !Array.isArray(parsed.tabs)) {
                        errorMsg = t('jsonFormatErrorMissingTabs');
                        isValid = false;
                    } else if (parsed.tabs.length === 0) {
                        // 允许空的 tabs 数组
                        isValid = true;
                    } else {
                        // 验证每个选项卡的基本结构
                        // id 和 name 是必需的，links 可以是空数组或不存在
                        const hasValidStructure = parsed.tabs.every(tab => {
                            // id 和 name 必须存在且不为空
                            const hasId = tab.id && typeof tab.id !== 'undefined';
                            const hasName = tab.name && typeof tab.name === 'string';
                            // links 可以是数组、空数组或不存在
                            const linksValid = !tab.links || Array.isArray(tab.links);
                            return hasId && hasName && linksValid;
                        });
                        
                        if (!hasValidStructure) {
                            errorMsg = t('jsonFormatErrorIncompleteStructure');
                            isValid = false;
                        } else {
                            isValid = true;
                        }
                    }
                } catch (e) {
                    errorMsg = t('jsonFormatErrorMessage') + e.message;
                    isValid = false;
                }
            } else if (pasteType === 'chrome') {
                // 校验 HTML 格式（检查是否包含书签相关标签）
                const htmlLower = content.toLowerCase();
                
                // 检查是否是有效的 Netscape 书签格式
                const isNetscapeFormat = htmlLower.includes('<!doctype netscape-bookmark-file-1>');
                const hasBookmarkStructure = htmlLower.includes('<dl>') && 
                                            htmlLower.includes('<dt>') && 
                                            (htmlLower.includes('<a href=') || htmlLower.includes('<h3'));
                
                if (isNetscapeFormat && hasBookmarkStructure) {
                    isValid = true;
                } else if (!isNetscapeFormat) {
                    errorMsg = t('htmlFormatErrorInvalid');
                    isValid = false;
                } else {
                    errorMsg = t('htmlFormatErrorIncomplete');
                    isValid = false;
                }
            }
            
            // 显示预览和验证结果
            const previewText = content.length > 100 ? content.substring(0, 100) + '...' : content;
            if (isValid) {
                const formatName = pasteType === 'mybookmark' ? 'JSON' : 'HTML';
                const successMsg = t('formatCorrectInputChars').replace('{format}', formatName).replace('{chars}', content.length);
                previewDiv.innerHTML = `<span style="color: #38a169;">${successMsg}</span><br><span style="color: #718096;font-size: 12px;">${previewText}</span>`;
                previewDiv.style.display = 'block';
                
                // 启用开始导入按钮
                startBtn.disabled = false;
                startBtn.style.opacity = '1';
                startBtn.style.cursor = 'pointer';
            } else {
                previewDiv.innerHTML = `<span style="color: #e53e3e;">${errorMsg}</span>`;
                previewDiv.style.display = 'block';
                
                // 禁用开始导入按钮
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.style.cursor = 'not-allowed';
            }
        }
        
        // 触发文件选择
        function triggerFileSelect() {
            const importType = document.querySelector('input[name="importType"]:checked').value;
            const fileInput = document.getElementById('importFile');
            
            // 根据导入类型设置接受的文件后缀
            if (importType === 'chrome') {
                fileInput.accept = '.html,.htm';
            } else {
                fileInput.accept = '.json';
            }
            
            fileInput.click();
        }
        
        // 处理导入文件选择
        function handleImportFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            pendingImportFile = file;
            
            // 显示文件名
            const fileNameDiv = document.getElementById('selectedFileName');
            fileNameDiv.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
            fileNameDiv.style.display = 'block';
            
            // 启用开始导入按钮
            const startBtn = document.getElementById('startImportBtn');
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.style.cursor = 'pointer';
        }
        
        // 打开导入类型选择对话框
        async function openImportTypeModal() {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            document.getElementById('importTypeModal').style.display = 'flex';
            
            // 重置为文件导入方式
            setImportMethod('file');
            
            // 重置选项
            document.querySelector('input[name="importType"][value="mybookmark"]').checked = true;
            document.querySelector('input[name="pasteType"][value="mybookmark"]').checked = true;
            document.getElementById('unifiedImportTabSection').style.display = 'none';
            
            // 重置文件选择
            pendingImportFile = null;
            document.getElementById('importFile').value = '';
            const fileNameDiv = document.getElementById('selectedFileName');
            fileNameDiv.style.display = 'none';
            fileNameDiv.textContent = '';
            
            // 重置粘贴内容
            document.getElementById('pasteContentArea').value = '';
            document.getElementById('pasteContentPreview').style.display = 'none';
            
            // 禁用开始导入按钮
            const startBtn = document.getElementById('startImportBtn');
            startBtn.disabled = true;
            startBtn.style.opacity = '0.5';
            startBtn.style.cursor = 'not-allowed';
            
            // 加载选项卡列表
            await loadImportTabOptions();
        }
        
        // 关闭导入类型选择对话框
        function closeImportTypeModal() {
            document.getElementById('importTypeModal').style.display = 'none';
            pendingImportFile = null;
            document.getElementById('importFile').value = '';
            
            // 隐藏文件名显示
            const fileNameDiv = document.getElementById('selectedFileName');
            fileNameDiv.style.display = 'none';
            fileNameDiv.textContent = '';
            
            // 禁用开始导入按钮
            const startBtn = document.getElementById('startImportBtn');
            startBtn.disabled = true;
            startBtn.style.opacity = '0.5';
            startBtn.style.cursor = 'not-allowed';
        }
        
        // 加载导入目标选项卡选项
        async function loadImportTabOptions() {
            try {
                const res = await fetch('/api/get');
                const data = await res.json();
                const tabs = data.tabs || [];
                
                const select = document.getElementById('unifiedImportTabSelect');
                const tabSection = document.getElementById('unifiedImportTabSection');
                select.innerHTML = '';
                
                tabs.forEach(tab => {
                    const option = document.createElement('option');
                    option.value = tab.id;
                    option.textContent = `${tab.name} (${tab.links ? tab.links.length : 0}${t('sitesCount')})`;
                    select.appendChild(option);
                });
                
                // 如果当前是 Chrome 类型，显示选项卡选择区域
                const importType = document.querySelector('input[name="importType"]:checked').value;
                if (importType === 'chrome') {
                    tabSection.style.display = 'block';
                }
            } catch (error) {
                console.error('Failed to load tabs:', error);
            }
        }
        
        // 导入类型改变时的处理
        function onImportTypeChange() {
            const importType = document.querySelector('input[name="importType"]:checked').value;
            const chromeSection = document.getElementById('unifiedImportTabSection');
            const fileInput = document.getElementById('importFile');
            
            if (importType === 'chrome') {
                chromeSection.style.display = 'block';
                fileInput.accept = '.html,.htm';
                // 加载选项卡列表并设置当前激活的选项卡为默认值
                loadUnifiedImportTabSelect();
            } else {
                chromeSection.style.display = 'none';
                fileInput.accept = '.json';
            }
            
            // 如果已经选择了文件，清空它（因为类型改变了）
            if (pendingImportFile) {
                pendingImportFile = null;
                fileInput.value = '';
                const fileNameDiv = document.getElementById('selectedFileName');
                fileNameDiv.style.display = 'none';
                fileNameDiv.textContent = '';
                
                // 禁用开始导入按钮
                const startBtn = document.getElementById('startImportBtn');
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.style.cursor = 'not-allowed';
            }
        }
        
        // 开始导入流程
        async function startImportProcess() {
            if (currentImportMethod === 'classic') {
                // 经典收藏导入
                if (!window.classicImportData) {
                    showToast('请先选择主题分类', 'error');
                    return;
                }
                
                const data = window.classicImportData;
                const targetTabId = document.getElementById('unifiedImportTabSelect').value;
                
                if (!targetTabId) {
                    showToast('请选择要导入到的选项卡', 'error');
                    return;
                }
                
                // 获取选中的链接
                const selectedCheckboxes = document.querySelectorAll('.link-checkbox:checked');
                let selectedLinks = [];
                
                selectedCheckboxes.forEach(checkbox => {
                    const tabIndex = parseInt(checkbox.dataset.tab);
                    const linkIndex = parseInt(checkbox.dataset.link);
                    
                    if (data.tabs && data.tabs[tabIndex] && data.tabs[tabIndex].links && data.tabs[tabIndex].links[linkIndex]) {
                        selectedLinks.push(data.tabs[tabIndex].links[linkIndex]);
                    }
                });
                
                if (selectedLinks.length === 0) {
                    showToast('请至少选择一个书签', 'error');
                    return;
                }
                
                // 确认导入
                customConfirm(`${t('confirmImport')} ${selectedLinks.length} ${t('bookmarks')}？${t('willMergeWithExisting')}`, async (confirmed) => {
                    if (!confirmed) {
                        return;
                    }
                    
                    // 关闭导入对话框
                    closeImportTypeModal();
                    
                    // 调用后端 API 导入数据到指定选项卡
                    try {
                        const response = await fetch('/api/importToTab', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                tabId: targetTabId,
                                links: selectedLinks
                            })
                        });
                        
                        const result = await response.json();
                        if (result.code === 0) {
                            let message = t('importSuccess');
                            if (result.added !== undefined && result.skipped !== undefined) {
                                message = t('importComplete') + result.added + t('skipDuplicate') + result.skipped + ' ';
                            } else if (result.message) {
                                message = result.message;
                            }
                            showToast(message, 'success');
                            // 重新加载整个页面数据（包括tabs和links）
                            await loadTabs();
                            await loadLinks();
                        } else {
                            showToast(t('importFailed') + (result.message || t('unknownError')), 'error');
                        }
                    } catch (error) {
                        console.error('Import error:', error);
                        showToast(t('importFailed') + error.message, 'error');
                    }
                });
                return;
            }
            
            const importType = currentImportMethod === 'file' 
                ? document.querySelector('input[name="importType"]:checked').value
                : document.querySelector('input[name="pasteType"]:checked').value;
            
            let dataToImport;
            
            if (currentImportMethod === 'file') {
                // 从文件导入
                if (!pendingImportFile) {
                    showToast(t('invalidFileFormat'), 'error');
                    return;
                }
                
                try {
                    const fileContent = await readFileAsText(pendingImportFile);
                    dataToImport = fileContent;
                } catch (error) {
                    console.error('Read file error:', error);
                    showToast('读取文件失败：' + error.message, 'error');
                    return;
                }
            } else {
                // 从粘贴内容导入
                const content = document.getElementById('pasteContentArea').value.trim();
                if (!content) {
                    showToast('请粘贴内容', 'warning');
                    return;
                }
                dataToImport = content;
            }
            
            // 保存数据引用，因为 closeImportTypeModal 会清空
            const dataRef = dataToImport;
            
            // 不要在这里关闭对话框，让导入函数自己决定何时关闭
            // closeImportTypeModal();
            
            if (importType === 'mybookmark') {
                // 使用原有的导入逻辑
                await importMyBookmarkDataFromString(dataRef);
            } else if (importType === 'chrome') {
                // 使用 Chrome/Edge 导入逻辑
                const targetTabId = document.getElementById('unifiedImportTabSelect').value;
                
                if (!targetTabId) {
                    showToast(t('selectTabForImport'), 'error');
                    return;
                }
                await importChromeBookmarksFromString(dataRef, targetTabId);
            }
        }

        // 读取文件为文本
        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });
        }

        // 从字符串导入 My Bookmark 数据
        async function importMyBookmarkDataFromString(jsonString) {
            try {
                const data = JSON.parse(jsonString);
                
                // 验证数据结构
                if (!data.tabs) {
                    showToast(t('jsonFormatErrorMissingTabs'), 'error');
                    return; // 失败时不关闭窗口
                }
                
                if (!Array.isArray(data.tabs)) {
                    showToast(t('jsonFormatErrorMissingTabs'), 'error');
                    return; // 失败时不关闭窗口
                }
                
                // 计算要导入的项目数量
                let itemCount = 0;
                if (data.tabs && Array.isArray(data.tabs)) {
                    data.tabs.forEach(tab => {
                        if (tab.links && Array.isArray(tab.links)) {
                            itemCount += tab.links.length;
                        }
                    });
                }
                
                if (itemCount === 0) {
                    showToast('文件中没有找到可导入的书签', 'error');
                    return; // 失败时不关闭窗口
                }
                
                // 确认导入
                customConfirm(`${t('confirmImport')} ${itemCount} ${t('bookmarks')}？${t('willMergeWithExisting')}`, async (confirmed) => {
                    if (!confirmed) {
                        // 用户取消，不关闭窗口，让用户可以继续操作
                        return;
                    }
                    
                    // 用户确认后，关闭导入对话框
                    closeImportTypeModal();
                    
                    // 如果包含 config，先保存配置
                    if (data.config) {
                        try {
                            await fetch('/api/saveConfig', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    copyright: data.config.copyright
                                })
                            });
                            debugLog('Config imported successfully');
                        } catch (configError) {
                            console.error('Failed to import config:', configError);
                        }
                    }
                    
                    // 调用后端 API 导入数据
                    const response = await fetch('/api/import', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    const result = await response.json();
                    if (result.code === 0) {
                        let message = t('importSuccess');
                        if (result.added !== undefined && result.skipped !== undefined) {
                            message = t('importComplete') + result.added + t('skipDuplicate') + result.skipped + ' ';
                        } else if (result.message) {
                            message = result.message;
                        }
                        showToast(message, 'success');
                        // 重新加载整个页面数据（包括tabs和links）
                        await loadTabs();
                        await loadLinks();
                    } else {
                        showToast(t('importFailed') + (result.message || t('unknownError')), 'error');
                    }
                });
            } catch (error) {
                console.error('Parse JSON error:', error);
                if (error instanceof SyntaxError) {
                    showToast(t('jsonFormatErrorMessage') + error.message, 'error');
                } else {
                    showToast(t('invalidFileFormat'), 'error');
                }
                // 失败时不关闭窗口，让用户可以修改内容后重试
            }
        }

        // 从字符串导入 Chrome 书签
        async function importChromeBookmarksFromString(htmlString, targetTabId) {
            try {
                // 解析 HTML 并提取书签
                const bookmarks = parseChromeBookmarks(htmlString);
                
                if (!bookmarks || bookmarks.length === 0) {
                    showToast('未找到有效的书签数据', 'error');
                    return; // 失败时不关闭窗口
                }
                
                // 确认导入
                customConfirm(`${t('confirmImport')} ${bookmarks.length} ${t('bookmarks')}？${t('willMergeWithExisting')}`, async (confirmed) => {
                    if (!confirmed) {
                        // 用户取消，不关闭窗口，让用户可以继续操作
                        return;
                    }
                    
                    // 用户确认后，关闭导入对话框
                    closeImportTypeModal();
                    
                    // 逐个添加到指定选项卡
                    let addedCount = 0;
                    let failedCount = 0;
                    
                    for (const bookmark of bookmarks) {
                        try {
                            const response = await fetch('/api/add', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    name: bookmark.name,
                                    url: bookmark.url,
                                    tabId: targetTabId
                                })
                            });
                            
                            const result = await response.json();
                            if (result.code === 0) {
                                addedCount++;
                            } else {
                                failedCount++;
                                console.warn('Failed to add bookmark:', bookmark.name, result.message);
                            }
                        } catch (err) {
                            console.error('Failed to add bookmark:', bookmark.name, err);
                            failedCount++;
                        }
                    }
                    
                    showToast(`${t('importComplete')}${addedCount}${t('skipDuplicate')}${failedCount}`, 'success');
                    
                    // 重新加载当前选项卡的数据
                    await loadLinks();
                });
            } catch (error) {
                console.error('Parse HTML error:', error);
                showToast('解析 HTML 失败：' + error.message, 'error');
                // 失败时不关闭窗口，让用户可以修改内容后重试
            }
        }
        
        // 解析 Chrome/Edge 书签 HTML 文件
        function parseChromeBookmarks(htmlContent) {
            const bookmarks = [];
            
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlContent, 'text/html');
                
                // 查找所有 <A> 标签，不仅限于 dt > a
                const links = doc.querySelectorAll('a[href]');
                debugLog('Found', links.length, 'link elements in HTML');
                
                links.forEach((link, index) => {
                    const href = link.getAttribute('href');
                    const title = link.textContent.trim();
                    
                    // 只处理 http/https 链接，跳过 file:// 等特殊协议
                    if (href && (href.startsWith('http://') || href.startsWith('https://')) && title) {
                        bookmarks.push({
                            name: title,
                            url: href
                        });
                        if (index < 3) {
                            debugLog('Parsed bookmark:', title, href);
                        }
                    }
                });
            } catch (parseError) {
                console.error('Error parsing HTML:', parseError);
            }
            
            return bookmarks;
        }
        
        // 导入 Chrome/Edge 书签
        async function importChromeBookmarks(file, targetTabId) {
            try {
                debugLog('Starting import of Chrome bookmarks file:', file.name);
                const text = await file.text();
                debugLog('File content length:', text.length);
                debugLog('First 200 chars:', text.substring(0, 200));
                
                const bookmarks = parseChromeBookmarks(text);
                debugLog('Parsed', bookmarks.length, 'bookmarks');
                
                if (bookmarks.length === 0) {
                    console.warn('No bookmarks found in file');
                    showToast('文件中没有找到有效的书签（只支持 http/https 链接）', 'error');
                    return;
                }
                
                // 确认导入
                customConfirm(`${t('confirmImport')} ${bookmarks.length} ${t('bookmarks')}？${t('willMergeWithExisting')}`, async (confirmed) => {
                    if (!confirmed) {
                        // 用户取消，不关闭窗口，让用户可以继续操作
                        return;
                    }
                    
                    // 用户确认后，关闭导入对话框
                    closeImportTypeModal();
                    
                    // 逐个添加到指定选项卡
                    let addedCount = 0;
                    let failedCount = 0;
                    
                    for (const bookmark of bookmarks) {
                        try {
                            const response = await fetch('/api/add', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    name: bookmark.name,
                                    url: bookmark.url,
                                    tabId: targetTabId
                                })
                            });
                            
                            const result = await response.json();
                            if (result.code === 0) {
                                addedCount++;
                            } else {
                                failedCount++;
                                console.warn('Failed to add bookmark:', bookmark.name, result.message);
                            }
                        } catch (err) {
                            console.error('Failed to add bookmark:', bookmark.name, err);
                            failedCount++;
                        }
                    }
                    
                    showToast(`${t('importComplete')}${addedCount}${t('skipDuplicate')}${failedCount}`, 'success');
                    
                    // 重新加载当前选项卡的数据
                    await loadLinks();
                });
            } catch (error) {
                console.error('Import Chrome bookmarks error:', error);
                showToast(t('importFailed') + error.message, 'error');
            }
        }
        
        // 导入 My Bookmark 数据（原有逻辑）
        async function importMyBookmarkData(file) {
            try {
                debugLog('Starting import of My Bookmark file:', file.name);
                const text = await file.text();
                debugLog('File content length:', text.length);
                debugLog('First 200 chars:', text.substring(0, 200));
                
                let data;
                try {
                    data = JSON.parse(text);
                    debugLog('JSON parsed successfully');
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    showToast(t('importFailed') + 'JSON格式错误: ' + parseError.message, 'error');
                    return;
                }
                
                // 计算要导入的项目数量
                let itemCount = 0;
                if (data.tabs && Array.isArray(data.tabs)) {
                    // 新格式：统计所有tabs中的links总数
                    data.tabs.forEach(tab => {
                        if (tab.links && Array.isArray(tab.links)) {
                            itemCount += tab.links.length;
                        }
                    });
                } else if (data.links && Array.isArray(data.links)) {
                    // 旧格式：直接统计links数量
                    itemCount = data.links.length;
                }
                
                debugLog('Found', itemCount, 'bookmarks to import');
                
                if (itemCount === 0) {
                    showToast('文件中没有找到可导入的书签', 'error');
                    return;
                }
                
                // 确认导入
                customConfirm(`${t('confirmImport')} ${itemCount} ${t('bookmarks')}？${t('willMergeWithExisting')}`, async (confirmed) => {
                    if (!confirmed) {
                        // 用户取消，不关闭窗口，让用户可以继续操作
                        return;
                    }
                    
                    // 用户确认后，关闭导入对话框
                    closeImportTypeModal();
                
                // 如果包含 config，先保存配置
                if (data.config) {
                    try {
                        await fetch('/api/saveConfig', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                copyright: data.config.copyright
                            })
                        });
                        debugLog('Config imported successfully');
                    } catch (configError) {
                        console.error('Failed to import config:', configError);
                        // 配置导入失败不影响书签导入
                    }
                }
                
                const response = await fetch('/api/import', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                if (result.code === 0) {
                    let message = t('importSuccess');
                    if (result.added !== undefined && result.skipped !== undefined) {
                        message = t('importComplete') + result.added + t('skipDuplicate') + result.skipped + ' ';
                    } else if (result.message) {
                        message = result.message;
                    }
                    showToast(message, 'success');
                    // 重新加载整个页面数据（包括tabs和links）
                    await loadTabs();
                    await loadLinks();
                } else {
                    showToast(t('importFailed') + (result.message || t('unknownError')), 'error');
                }
                });
            } catch (error) {
                console.error('Import error:', error);
                showToast(t('importFailed') + error.message, 'error');
            }
        }

        // 显示移动到Tab的弹窗
        async function showMoveToTabModal(linkId) {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            movingLinkId = linkId;
            const res = await fetch('/api/get');
            const data = await res.json();
            const tabs = data.tabs || [];
            
            const select = document.getElementById('targetTabSelect');
            select.innerHTML = '';
            
            tabs.forEach(tab => {
                if (tab.id !== currentTabId) { // 排除当前Tab
                    const option = document.createElement('option');
                    option.value = tab.id;
                    option.textContent = `${tab.name} (${tab.links ? tab.links.length : 0}${t('sitesCount')})`;
                    select.appendChild(option);
                }
            });
            
            if (tabs.length <= 1) {
                alert(t('noOtherTab'));
                return;
            }
            
            document.getElementById('moveToTabModal').style.display = 'flex';
        }

        // 关闭移动到Tab的弹窗
        function closeMoveToTabModal() {
            document.getElementById('moveToTabModal').style.display = 'none';
            movingLinkId = null;
        }

        // 确认移动到Tab
        async function confirmMoveToTab() {
            const targetTabId = document.getElementById('targetTabSelect').value; // Tab ID 可能是字符串或数字
            if (!targetTabId || !movingLinkId) return;
            
            try {
                const response = await fetch('/api/moveLinkToTab', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        linkId: movingLinkId,
                        fromTabId: currentTabId,
                        toTabId: targetTabId
                    })
                });
                
                const result = await response.json();
                if (result.code === 0) {
                    closeMoveToTabModal();
                    loadLinks();
                    loadTabs();
                } else {
                    alert(result.message || t('moveFailed'));
                }
            } catch (error) {
                console.error('Move link error:', error);
                alert(t('moveLinkError') + error.message);
            }
        }

        // 打开设置弹窗
        async function openSettingsModal() {
            try {
                // 获取配置
                const configResponse = await fetch('/api/getConfig');
                const configResult = await configResponse.json();
                
                // 获取系统配置 (debug)
                const systemConfigResponse = await fetch('/api/getSystemConfig');
                const systemConfigResult = await systemConfigResponse.json();
                
                // 获取常量信息
                const constantsResponse = await fetch('/api/getConstants');
                const constantsResult = await constantsResponse.json();
                
                // 获取标题
                const titleResponse = await fetch('/api/get');
                const titleResult = await titleResponse.json();
                
                if (configResult.code === 0 && systemConfigResult.code === 0) {
                    // 设置标题
                    document.getElementById('settingTitle').value = titleResult.title || '';
                    
                    // 设置端口为只读显示
                    document.getElementById('settingPort').value = configResult.port;
                    document.getElementById('settingDebug').checked = systemConfigResult.debug;
                    
                    // 显示版权信息到输入框
                    if (constantsResult.code === 0) {
                        document.getElementById('settingCopyright').value = constantsResult.copyright || '';
                        // 显示版本信息
                        document.getElementById('settingVersion').textContent = `v${constantsResult.version || '1.0.0'}`;
                    }
                    
                    document.getElementById('settingsModal').style.display = 'flex';
                } else {
                    showToast(t('getConfigFailed'), 'error');
                }
            } catch (error) {
                console.error('Get config error:', error);
                showToast(t('getConfigFailed') + '：' + error.message, 'error');
            }
        }

        // 关闭设置弹窗
        function closeSettingsModal() {
            document.getElementById('settingsModal').style.display = 'none';
        }

        // 保存设置
        async function saveSettings() {
            // 检查是否处于锁定模式
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            const title = document.getElementById('settingTitle').value.trim();
            const debug = document.getElementById('settingDebug').checked;
            const copyright = document.getElementById('settingCopyright').value.trim();
            
            try {
                // 保存标题
                if (title) {
                    await fetch('/api/updateTitle', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ title: title })
                    });
                    // 更新页面显示
                    const toolbarTitleEl = document.getElementById('toolbarTitle');
                    if (toolbarTitleEl) {
                        toolbarTitleEl.textContent = title;
                    }
                    document.title = title;
                    debugLog('Title saved');
                }
                
                // 保存 config.json 配置（不包含端口）
                const configResponse = await fetch('/api/saveConfig', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ copyright: copyright })
                });
                
                const configResult = await configResponse.json();
                if (configResult.code !== 0) {
                    showToast(t('configSaveFailed') + (configResult.message || t('unknownError')), 'error');
                    return;
                }
                
                // 保存 system 配置 (debug)
                const systemConfigResponse = await fetch('/api/saveSystemConfig', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ debug: debug })
                });
                
                const systemConfigResult = await systemConfigResponse.json();
                if (systemConfigResult.code === 0) {
                    // 更新本地调试模式状态
                    isDebugMode = debug;
                    debugLog('Debug mode updated:', isDebugMode);
                    
                    closeSettingsModal();
                    showToast(t('configSaved'), 'success', 5000);
                } else {
                    showToast(t('configSaveFailed') + (systemConfigResult.message || t('unknownError')), 'error');
                }
            } catch (error) {
                console.error('Save config error:', error);
                showToast(t('configSaveFailed') + error.message, 'error');
            }
        }

        // 刷新 Favicon
        async function refreshFavicon(linkId) {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            try {
                const response = await fetch('/api/refreshFavicon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ linkId: linkId, tabId: currentTabId })
                });
                
                const result = await response.json();
                if (result.code === 0) {
                    showToast('图标刷新中，请稍后刷新页面查看', 'info', 3000);
                    // 延迟一下重新加载，给服务器时间下载
                    setTimeout(() => {
                        loadLinks();
                    }, 2000);
                } else {
                    showToast('刷新失败：' + (result.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('Refresh favicon error:', error);
                showToast('刷新失败：' + error.message, 'error');
            }
        }
        
        // 切换卡片锁定状态
        async function toggleLockCard(linkId, lock) {
            if (isLockMode) {
                showToast(t('lockedModeTip'), 'warning');
                return;
            }
            
            try {
                if (lock) {
                    // 锁定操作，先确认
                    showConfirm(t('confirmLock'), async (confirmed) => {
                        if (!confirmed) return;
                        
                        try {
                            const response = await fetch('/api/toggleLock', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ linkId: linkId, tabId: currentTabId, locked: true })
                            });
                            
                            const result = await response.json();
                            if (result.code === 0) {
                                showToast(t('lockedCardTip'), 'success');
                                loadLinks();
                            } else {
                                showToast('锁定失败：' + (result.message || '未知错误'), 'error');
                            }
                        } catch (error) {
                            console.error('Lock card error:', error);
                            showToast('锁定失败：' + error.message, 'error');
                        }
                    });
                } else {
                    // 解锁操作，也需要确认
                    showConfirm(t('confirmUnlock'), async (confirmed) => {
                        if (!confirmed) return;
                        
                        try {
                            const response = await fetch('/api/toggleLock', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ linkId: linkId, tabId: currentTabId, locked: false })
                            });
                            
                            const result = await response.json();
                            if (result.code === 0) {
                                showToast(t('unlockCard'), 'success');
                                loadLinks();
                            } else {
                                showToast('解锁失败：' + (result.message || '未知错误'), 'error');
                            }
                        } catch (error) {
                            console.error('Unlock card error:', error);
                            showToast('解锁失败：' + error.message, 'error');
                        }
                    });
                }
            } catch (error) {
                console.error('Toggle lock error:', error);
                showToast('操作失败：' + error.message, 'error');
            }
        }
        
        // ==================== Custom Dialog Functions ====================
        
        // Toast 提示
        function showToast(message, type = 'info', duration = 3000) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            
            // 添加图标（使用 SVG 确保跨浏览器一致显示）
            const icons = {
                success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
                error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
                warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
                info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
            };
            
            toast.innerHTML = `<span style="font-size: 18px;">${icons[type]}</span><span>${message}</span>`;
            container.appendChild(toast);
            
            // 自动消失
            setTimeout(() => {
                toast.classList.add('hiding');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, duration);
        }
        
        // 自定义 Confirm
        function showConfirm(message, callback) {
            confirmCallback = callback;
            document.getElementById('confirmMessage').textContent = message;
            document.getElementById('confirmOverlay').style.display = 'flex';
        }
        
        function closeConfirm(result) {
            document.getElementById('confirmOverlay').style.display = 'none';
            if (confirmCallback) {
                confirmCallback(result);
                confirmCallback = null;
            }
        }
        
        // 自定义 Prompt
        function showPrompt(title, defaultValue, callback) {
            promptCallback = callback;
            document.getElementById('promptTitle').textContent = title;
            document.getElementById('promptInput').value = defaultValue || '';
            document.getElementById('promptOverlay').style.display = 'flex';
            
            // 自动聚焦并选中
            setTimeout(() => {
                const input = document.getElementById('promptInput');
                input.focus();
                input.select();
            }, 100);
        }
        
        function closePrompt(value) {
            document.getElementById('promptOverlay').style.display = 'none';
            if (promptCallback) {
                promptCallback(value);
                promptCallback = null;
            }
        }
        
        function closePromptWithInput() {
            const value = document.getElementById('promptInput').value;
            closePrompt(value);
        }
        
        // 重写系统函数
        window.customAlert = function(message) {
            showToast(message, 'info');
        };
        
        window.customConfirm = function(message, callback) {
            showConfirm(message, callback);
        };
        
        window.customPrompt = function(title, defaultValue, callback) {
            showPrompt(title, defaultValue, callback);
        };
        
        // 经典收藏分类搜索相关变量
        let categorySearchTimer = null;
        let classicCategoryData = []; // 缓存当前搜索结果
        
        // 初始化经典收藏分类搜索界面
        function loadClassicCategories() {
            const searchInput = document.getElementById('classicCategorySearch');
            const resultsDiv = document.getElementById('classicCategoryResults');
            const hiddenInput = document.getElementById('classicCategorySelect');
            
            // 重置状态
            searchInput.value = '';
            resultsDiv.innerHTML = '';
            hiddenInput.value = '';
            classicCategoryData = [];
            
            // 初始加载所有分类（空关键词）
            searchClassicCategories('');
        }
        
        // 防抖搜索分类（300ms）
        function debounceSearchCategories() {
            if (categorySearchTimer) clearTimeout(categorySearchTimer);
            categorySearchTimer = setTimeout(() => {
                const keyword = document.getElementById('classicCategorySearch').value.trim();
                // 清空已选分类
                document.getElementById('classicCategorySelect').value = '';
                document.getElementById('classicPreviewSection').style.display = 'none';
                document.getElementById('unifiedImportTabSection').style.display = 'none';
                const startBtn = document.getElementById('startImportBtn');
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.style.cursor = 'not-allowed';
                searchClassicCategories(keyword);
            }, 300);
        }
        
        // 搜索经典收藏分类（带 keyword 参数）
        async function searchClassicCategories(keyword) {
            const resultsDiv = document.getElementById('classicCategoryResults');
            resultsDiv.innerHTML = `<div style="grid-column: 1/-1;padding: 10px;text-align: center;color: #718096;">${t('loadingDots')}</div>`;
            
            try {
                const baseUrl = 'https://mb.ostour.cn/xapi/siteCategories/open';
                const url = keyword ? `${baseUrl}?filter=${encodeURIComponent(keyword)}` : baseUrl;
                const response = await fetch(url);
                const result = await response.json();
                
                if (result.code === 0 && result.data && result.data.length > 0) {
                    classicCategoryData = result.data;
                    const selectedId = document.getElementById('classicCategorySelect').value;
                    let html = '';
                    result.data.forEach((category, index) => {
                        const isSelected = category.id === selectedId;
                        const bg = isSelected ? '#ebf8ff' : 'white';
                        const border = isSelected ? '2px solid #4299e1' : '1px solid #e2e8f0';
                        html += `<div data-index="${index}" onmousedown="event.preventDefault();selectClassicCategoryByIndex(${index})" style="padding: 8px 10px;cursor: pointer;font-size: 13px;color: #2d3748;background: ${bg};border: ${border};border-radius: 4px;display: flex;align-items: center;gap: 5px;transition: background 0.15s;" onmouseover="if(this.dataset.selected!=='true'){this.style.background='#edf2f7'}" onmouseout="if(this.dataset.selected!=='true'){this.style.background='${bg}'}">📁 <span style="overflow: hidden;text-overflow: ellipsis;white-space: nowrap;">${category.categoryName}</span></div>`;
                    });
                    resultsDiv.innerHTML = html;
                } else {
                    classicCategoryData = [];
                    resultsDiv.innerHTML = `<div style="grid-column: 1/-1;padding: 10px;text-align: center;color: #a0aec0;">${t('noCategoriesFound')}</div>`;
                }
            } catch (error) {
                debugLog('Search classic categories error:', error);
                classicCategoryData = [];
                resultsDiv.innerHTML = `<div style="grid-column: 1/-1;padding: 10px;text-align: center;color: #e53e3e;">${t('loadFailed')}</div>`;
            }
        }
        
        // 通过索引选择分类（避免转义问题）
        function selectClassicCategoryByIndex(index) {
            const category = classicCategoryData[index];
            if (category) {
                selectClassicCategory(category.id, category.categoryName);
            }
        }
        
        // 选择分类
        function selectClassicCategory(id, name) {
            document.getElementById('classicCategorySelect').value = id;
            
            // 更新选中状态（不隐藏结果列表）
            const items = document.getElementById('classicCategoryResults').children;
            for (let item of items) {
                const idx = parseInt(item.dataset.index);
                if (!isNaN(idx) && classicCategoryData[idx]) {
                    if (classicCategoryData[idx].id === id) {
                        item.style.background = '#ebf8ff';
                        item.style.border = '2px solid #4299e1';
                        item.dataset.selected = 'true';
                    } else {
                        item.style.background = 'white';
                        item.style.border = '1px solid #e2e8f0';
                        item.dataset.selected = 'false';
                    }
                }
            }
            
            loadClassicBookmarks();
        }
        
        // 加载经典收藏内容
        async function loadClassicBookmarks() {
            const categoryId = document.getElementById('classicCategorySelect').value;
            const previewSection = document.getElementById('classicPreviewSection');
            const previewContent = document.getElementById('classicPreviewContent');
            const tabSelectSection = document.getElementById('unifiedImportTabSection');
            const startBtn = document.getElementById('startImportBtn');
            
            if (!categoryId) {
                previewSection.style.display = 'none';
                tabSelectSection.style.display = 'none';
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.style.cursor = 'not-allowed';
                return;
            }
            
            previewContent.innerHTML = `<div style="text-align: center;color: #718096;">${t('loadingDots')}</div>`;
            previewSection.style.display = 'block';
            tabSelectSection.style.display = 'none';
            
            try {
                const response = await fetch(`https://mb.ostour.cn/xapi/siteInfo/${categoryId}/open`);
                const result = await response.json();
                
                if (result.code === 0 && result.data) {
                    // 解析 JSON 字符串
                    const data = JSON.parse(result.data);
                    
                    // 显示预览，带复选框
                    let previewHTML = '';
                    let totalLinks = 0;
                    
                    if (data.tabs && data.tabs.length > 0) {
                        data.tabs.forEach((tab, tabIndex) => {
                            const siteCount = tab.links ? tab.links.length : 0;
                            totalLinks += siteCount;
                            
                            previewHTML += `<div style="margin-bottom: 15px;">`;
                            previewHTML += `<div style="margin-bottom: 8px;font-weight: bold;color: #2d3748;">`;
                            previewHTML += `<input type="checkbox" id="tab-checkbox-${tabIndex}" checked onchange="toggleTabLinks(${tabIndex})" style="margin-right: 8px;width: 16px;height: 16px;cursor: pointer;">`;
                            previewHTML += `${tab.name} (${siteCount} ${t('sitesCount')})`;
                            previewHTML += `</div>`;
                            
                            if (tab.links && tab.links.length > 0) {
                                previewHTML += `<div style="margin-left: 24px;display: grid;grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));gap: 8px;">`;
                                tab.links.forEach((link, linkIndex) => {
                                    previewHTML += `<div style="display: flex;align-items: center;padding: 6px 8px;background: white;border-radius: 4px;border: 1px solid #e2e8f0;min-width: 0;cursor: pointer;transition: all 0.2s;" onclick="toggleLinkCheckbox(event, ${tabIndex}, ${linkIndex})" onmouseover="this.style.background='#ebf8ff';this.style.borderColor='#4299e1'" onmouseout="this.style.background='white';this.style.borderColor='#e2e8f0'">`;
                                    previewHTML += `<input type="checkbox" class="link-checkbox" data-tab="${tabIndex}" data-link="${linkIndex}" checked onchange="updateSelectedCount()" style="margin-right: 8px;width: 14px;height: 14px;cursor: pointer;flex-shrink: 0;pointer-events: none;">`;
                                    previewHTML += `<span style="color: #4a5568;font-size: 13px;white-space: nowrap;overflow: hidden;text-overflow: ellipsis;" title="${link.name}">${link.name}</span>`;
                                    previewHTML += `</div>`;
                                });
                                previewHTML += `</div>`;
                            }
                            previewHTML += `</div>`;
                        });
                    }
                    
                    previewContent.innerHTML = previewHTML;
                    
                    // 保存数据供导入使用
                    window.classicImportData = data;
                    
                    // 更新选中数量
                    updateSelectedCount();
                    
                    // 加载选项卡列表
                    await loadUnifiedImportTabSelect();
                } else {
                    previewContent.innerHTML = `<div style="text-align: center;color: #e53e3e;">${t('loadFailed')}</div>`;
                    showToast(t('loadFailed'), 'error');
                }
            } catch (error) {
                console.error('Load classic bookmarks error:', error);
                previewContent.innerHTML = `<div style="text-align: center;color: #e53e3e;">${t('loadFailed')}</div>`;
                showToast(t('loadFailed') + '：' + error.message, 'error');
            }
        }
        
        // 切换整个Tab的选中状态
        function toggleTabLinks(tabIndex) {
            const tabCheckbox = document.getElementById(`tab-checkbox-${tabIndex}`);
            const isChecked = tabCheckbox.checked;
            const linkCheckboxes = document.querySelectorAll(`.link-checkbox[data-tab="${tabIndex}"]`);
            
            linkCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
            });
            
            updateSelectedCount();
        }
        
        // 点击站点名称切换复选框状态
        function toggleLinkCheckbox(event, tabIndex, linkIndex) {
            // 防止事件冒泡导致重复触发
            event.stopPropagation();
            
            // 查找对应的复选框
            const checkbox = document.querySelector(`.link-checkbox[data-tab="${tabIndex}"][data-link="${linkIndex}"]`);
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                updateSelectedCount();
            }
        }
        
        // 全选/取消全选
        function selectAllClassicLinks(selectAll) {
            const allCheckboxes = document.querySelectorAll('.link-checkbox');
            const allTabCheckboxes = document.querySelectorAll('[id^="tab-checkbox-"]');
            
            allCheckboxes.forEach(checkbox => {
                checkbox.checked = selectAll;
            });
            
            allTabCheckboxes.forEach(checkbox => {
                checkbox.checked = selectAll;
            });
            
            updateSelectedCount();
        }
        
        // 更新选中数量显示
        function updateSelectedCount() {
            const selectedCheckboxes = document.querySelectorAll('.link-checkbox:checked');
            const totalCheckboxes = document.querySelectorAll('.link-checkbox');
            const selectedCount = selectedCheckboxes.length;
            const totalCount = totalCheckboxes.length;
            
            const countInfo = document.getElementById('selectedCountInfo');
            countInfo.textContent = `${t('selected')} ${selectedCount} / ${totalCount} ${t('bookmarks')}`;
            countInfo.style.display = 'block';
            
            // 启用或禁用开始导入按钮
            const startBtn = document.getElementById('startImportBtn');
            if (selectedCount > 0) {
                startBtn.disabled = false;
                startBtn.style.opacity = '1';
                startBtn.style.cursor = 'pointer';
            } else {
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.style.cursor = 'not-allowed';
            }
        }
