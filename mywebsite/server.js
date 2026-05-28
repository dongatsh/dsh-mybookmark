const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const DATA_FILE = path.join(__dirname, 'mywebsite.json');

// 读取数据
function readData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // 如果是旧格式（数组），转换为新格式
    if (Array.isArray(data)) {
      return { title: '本地网址收藏工具', iconSize: 'medium', tabs: [{ id: Date.now(), name: '我的常用站点', links: data }] };
    }
    // 确保有默认值
    if (!data.iconSize) {
      data.iconSize = 'medium';
    }
    // 如果没有tabs，创建默认的tab
    if (!data.tabs || !Array.isArray(data.tabs) || data.tabs.length === 0) {
      data.tabs = [{ id: Date.now(), name: '我的常用站点', links: data.links || [] }];
    }
    // 确保有currentTabId
    if (!data.currentTabId && data.tabs.length > 0) {
      data.currentTabId = data.tabs[0].id;
    }
    return data;
  } catch {
    return { title: '本地网址收藏工具', iconSize: 'medium', tabs: [{ id: Date.now(), name: '我的常用站点', links: [] }] };
  }
}

// 写入数据
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 跨域、编码设置
  res.setHeader('Access-Control-Allow-Origin', '*');

  // favicon.ico 或 favicon.png
  if (pathname === '/favicon.ico' || pathname === '/favicon.png') {
    const faviconPath = path.join(__dirname, 'favicon.png');
    fs.readFile(faviconPath, (err, content) => {
      if (err) {
        res.statusCode = 404;
        res.end('Favicon not found');
      } else {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天
        res.end(content);
      }
    });
    return;
  }

  // 首页 HTML
  if (pathname === '/' || pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
      if (err) {
        res.statusCode = 500;
        res.end('页面加载失败');
      } else {
        res.end(content);
      }
    });
    return;
  }

  // 获取所有收藏
  if (pathname === '/api/get' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    const data = readData();
    // 返回当前tab的links
    const currentTab = data.tabs.find(t => t.id === data.currentTabId);
    const response = {
      title: data.title,
      iconSize: data.iconSize,
      tabs: data.tabs,
      currentTabId: data.currentTabId,
      links: currentTab ? currentTab.links : []
    };
    res.end(JSON.stringify(response));
    return;
  }

  // 新增收藏
  if (pathname === '/api/add' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        const data = readData();
        // 添加到当前tab
        const currentTab = data.tabs.find(t => t.id === data.currentTabId);
        if (currentTab) {
          currentTab.links.push({ id: Date.now(), name: item.name, url: item.url });
        }
        writeData(data);
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Parse error' }));
      }
    });
    return;
  }

  // 删除收藏
  if (pathname === '/api/del' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        const data = readData();
        // 从当前tab中删除
        const currentTab = data.tabs.find(t => t.id === data.currentTabId);
        if (currentTab) {
          currentTab.links = currentTab.links.filter(li => li.id !== id);
        }
        writeData(data);
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Parse error' }));
      }
    });
    return;
  }

  // 更新收藏
  if (pathname === '/api/update' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { id, name, url } = JSON.parse(body);
        console.log('Updating bookmark:', { id, name, url });
        const data = readData();
        // 在当前tab中查找并更新
        const currentTab = data.tabs.find(t => t.id === data.currentTabId);
        if (currentTab) {
          const index = currentTab.links.findIndex(li => li.id === id);
          console.log('Found index:', index);
          if (index !== -1) {
            currentTab.links[index].name = name;
            currentTab.links[index].url = url;
            console.log('Updated data:', data);
            writeData(data);
            console.log('Data written successfully');
            res.end(JSON.stringify({ code: 0 }));
          } else {
            console.log('Bookmark not found with id:', id);
            res.statusCode = 404;
            res.end(JSON.stringify({ code: 1, message: 'Not found' }));
          }
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        console.error('Update error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 更新标题
  if (pathname === '/api/updateTitle' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { title } = JSON.parse(body);
        console.log('Updating title to:', title);
        const data = readData();
        data.title = title;
        writeData(data);
        console.log('Title updated successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        console.error('Update title error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 更新排序
  if (pathname === '/api/updateOrder' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { linkIds } = JSON.parse(body);
        console.log('Updating order:', linkIds);
        const data = readData();
        // 根据ID数组重新排序当前tab的links
        const currentTab = data.tabs.find(t => t.id === data.currentTabId);
        if (currentTab) {
          const newLinks = [];
          linkIds.forEach(id => {
            const link = currentTab.links.find(l => l.id === id);
            if (link) {
              newLinks.push(link);
            }
          });
          currentTab.links = newLinks;
          writeData(data);
          console.log('Order updated successfully');
          res.end(JSON.stringify({ code: 0 }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        console.error('Update order error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 更新图标大小
  if (pathname === '/api/updateIconSize' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { iconSize } = JSON.parse(body);
        console.log('Updating icon size to:', iconSize);
        const data = readData();
        data.iconSize = iconSize;
        writeData(data);
        console.log('Icon size updated successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        console.error('Update icon size error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 导入数据
  if (pathname === '/api/import' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const importedData = JSON.parse(body);
        console.log('Importing data...');
        // 验证数据结构
        if (!importedData.links || !Array.isArray(importedData.links)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 1, message: 'Invalid data format' }));
          return;
        }
        
        const currentData = readData();
        const currentTab = currentData.tabs.find(t => t.id === currentData.currentTabId);
        
        if (!currentTab) {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Current tab not found' }));
          return;
        }
        
        // 获取当前tab已有的 URL 列表（用于去重）
        const existingUrls = new Set(currentTab.links.map(link => link.url));
        
        // 过滤掉已存在的 URL，只保留新的
        const newLinks = [];
        let duplicateCount = 0;
        
        importedData.links.forEach(link => {
          if (!existingUrls.has(link.url)) {
            // 生成新的ID避免冲突
            link.id = Date.now() + Math.random();
            newLinks.push(link);
            existingUrls.add(link.url); // 添加到集合中，防止导入数据内部重复
          } else {
            duplicateCount++;
          }
        });
        
        console.log(`Importing ${newLinks.length} new links, skipping ${duplicateCount} duplicates`);
        
        // 合并数据到当前tab
        currentTab.links = [...currentTab.links, ...newLinks];
        if (importedData.title) {
          currentData.title = importedData.title;
        }
        writeData(currentData);
        console.log('Data imported successfully');
        res.end(JSON.stringify({ code: 0, added: newLinks.length, skipped: duplicateCount }));
      } catch (err) {
        console.error('Import error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 切换 Tab
  if (pathname === '/api/switchTab' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { tabId } = JSON.parse(body);
        console.log('Switching to tab:', tabId);
        const data = readData();
        const tab = data.tabs.find(t => t.id === tabId);
        if (tab) {
          data.currentTabId = tabId;
          writeData(data);
          console.log('Tab switched successfully');
          res.end(JSON.stringify({ code: 0 }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        console.error('Switch tab error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 添加 Tab
  if (pathname === '/api/addTab' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body);
        console.log('Adding tab:', name);
        const data = readData();
        const newTab = {
          id: Date.now(),
          name: name,
          links: []
        };
        data.tabs.push(newTab);
        data.currentTabId = newTab.id; // 自动切换到新tab
        writeData(data);
        console.log('Tab added successfully');
        res.end(JSON.stringify({ code: 0, tabId: newTab.id }));
      } catch (err) {
        console.error('Add tab error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 删除 Tab
  if (pathname === '/api/deleteTab' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { tabId } = JSON.parse(body);
        console.log('Deleting tab:', tabId);
        const data = readData();
        
        // 至少保留一个tab
        if (data.tabs.length <= 1) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 1, message: '至少需要保留一个Tab' }));
          return;
        }
        
        const tabIndex = data.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
          return;
        }
        
        const tabToDelete = data.tabs[tabIndex];
        
        // 检查是否有站点
        if (tabToDelete.links && tabToDelete.links.length > 0) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 1, message: `该Tab中有${tabToDelete.links.length}个站点，请先清空后再删除` }));
          return;
        }
        
        // 删除tab
        data.tabs.splice(tabIndex, 1);
        
        // 如果删除的是当前tab，切换到第一个tab
        if (data.currentTabId === tabId && data.tabs.length > 0) {
          data.currentTabId = data.tabs[0].id;
        }
        
        writeData(data);
        console.log('Tab deleted successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        console.error('Delete tab error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 更新 Tab 排序
  if (pathname === '/api/updateTabOrder' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { tabIds } = JSON.parse(body);
        console.log('Updating tab order:', tabIds);
        const data = readData();
        
        // 根据ID数组重新排序tabs
        const newTabs = [];
        tabIds.forEach(id => {
          const tab = data.tabs.find(t => t.id === id);
          if (tab) {
            newTabs.push(tab);
          }
        });
        
        data.tabs = newTabs;
        writeData(data);
        console.log('Tab order updated successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        console.error('Update tab order error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 更新 Tab 名称
  if (pathname === '/api/updateTabName' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { tabId, name } = JSON.parse(body);
        console.log('Updating tab name:', tabId, name);
        const data = readData();
        const tab = data.tabs.find(t => t.id === tabId);
        if (tab) {
          tab.name = name;
          writeData(data);
          console.log('Tab name updated successfully');
          res.end(JSON.stringify({ code: 0 }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        console.error('Update tab name error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 移动链接到其他Tab
  if (pathname === '/api/moveLinkToTab' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { linkId, fromTabId, toTabId } = JSON.parse(body);
        console.log('Moving link:', linkId, 'from', fromTabId, 'to', toTabId);
        const data = readData();
        
        const fromTab = data.tabs.find(t => t.id === fromTabId);
        const toTab = data.tabs.find(t => t.id === toTabId);
        
        if (!fromTab || !toTab) {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
          return;
        }
        
        // 从源Tab中找到链接
        const linkIndex = fromTab.links.findIndex(l => l.id === linkId);
        if (linkIndex === -1) {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Link not found' }));
          return;
        }
        
        // 移除链接
        const link = fromTab.links.splice(linkIndex, 1)[0];
        
        // 添加到目标Tab
        toTab.links.push(link);
        
        writeData(data);
        console.log('Link moved successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        console.error('Move link error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 404 for all other routes
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain;charset=utf-8');
  res.end('404 Not Found');
});

server.listen(PORT, () => {
  console.log(`服务已启动，访问：http://localhost:${PORT}`);
  console.log(`数据文件：${DATA_FILE}`);
});