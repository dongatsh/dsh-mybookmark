const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');

// 读取配置文件
const CONFIG_FILE = path.join(__dirname, 'config.json');
let config;
try {
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    console.log('配置文件加载成功');
  } else {
    // 配置文件不存在，创建默认配置
    config = { port: 8080, debug: false };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    console.log('配置文件不存在，已创建默认配置文件');
  }
} catch (err) {
  console.error('配置文件加载失败，使用默认配置:', err.message);
  config = { port: 8080, debug: false };
}

// 读取常量配置文件
const CONSTANT_FILE = path.join(__dirname, 'constant.json');
let constants;
try {
  constants = JSON.parse(fs.readFileSync(CONSTANT_FILE, 'utf8'));
} catch (err) {
  console.warn('常量配置文件加载失败，使用默认值');
  constants = { version: '1.0.0', copyright: '(c) DSH - MyBookmark' };
}

const PORT = config.port || 8080;
const DATA_FILE = path.join(__dirname, 'mybookmark.json');
const FAVICONS_DIR = path.join(__dirname, 'favicons');
const DEFAULT_FAVICON = path.join(__dirname, 'website.png');

// 确保 favicons 目录存在
if (!fs.existsSync(FAVICONS_DIR)) {
  fs.mkdirSync(FAVICONS_DIR, { recursive: true });
}

// 调试日志函数 - 每次调用时动态读取配置
function debugLog(...args) {
  try {
    const currentConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (currentConfig.debug) {
      console.log(...args);
    }
  } catch (err) {
    // 如果读取失败，不输出日志
  }
}

// 读取数据
function readData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // 如果是旧格式（数组），转换为新格式
    if (Array.isArray(data)) {
      return { title: '我的收藏地址', iconSize: 'medium', tabs: [{ id: 1, name: '我的常用站点', links: data }] };
    }
    // 确保有默认值
    if (!data.iconSize) {
      data.iconSize = 'medium';
    }
    // 如果没有tabs，创建默认的tab
    if (!data.tabs || !Array.isArray(data.tabs) || data.tabs.length === 0) {
      data.tabs = [{ id: 1, name: '我的常用站点', links: data.links || [] }];
    }
    // 确保有currentTabId
    if (!data.currentTabId && data.tabs.length > 0) {
      data.currentTabId = data.tabs[0].id;
    }
    return data;
  } catch {
    // 如果文件不存在或解析失败，创建默认数据
    // 这里使用中文作为默认语言，前端会根据用户选择切换
    const defaultData = { 
      title: '我的收藏地址', 
      iconSize: 'medium', 
      currentTabId: 1,
      tabs: [{ id: 1, name: '我的常用站点', links: [] }] 
    };
    // 立即写入默认数据到文件
    writeData(defaultData);
    return defaultData;
  }
}

// 写入数据
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 确保URL有协议前缀
function ensureUrlProtocol(url) {
  if (!url) return url;
  const trimmed = url.trim();
  // 如果已经有协议前缀，直接返回
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  // 如果没有协议，添加 https://
  return 'https://' + trimmed;
}

// 从 URL 提取域名
function extractDomain(urlStr) {
  try {
    const urlObj = new URL(urlStr);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

// 获取 favicon 文件路径
function getFaviconPath(domain) {
  return path.join(FAVICONS_DIR, `${domain}.png`);
}

// 下载并保存 favicon
function downloadFavicon(domain, callback) {
  const faviconPath = getFaviconPath(domain);
  
  // 如果已经存在，直接返回
  if (fs.existsSync(faviconPath)) {
    debugLog(`✓ Using cached favicon for ${domain}`);
    callback(null, faviconPath);
    return;
  }
  
  // 构建尝试的 URL 列表，避免重复添加 www
  const urls = [];
  const hasWww = domain.startsWith('www.');
  
  if (hasWww) {
    // 如果已经有 www，只尝试原域名
    urls.push(`https://${domain}/favicon.ico`);
    urls.push(`https://${domain}/favicon.png`);
  } else {
    // 如果没有 www，先尝试不带 www，再尝试带 www
    urls.push(`https://${domain}/favicon.ico`);
    urls.push(`https://${domain}/favicon.png`);
    urls.push(`https://www.${domain}/favicon.ico`);
    urls.push(`https://www.${domain}/favicon.png`);
  }
  
  let currentIndex = 0;
  
  function tryDownload() {
    if (currentIndex >= urls.length) {
      // 所有尝试都失败，使用默认图标
      debugLog(`Failed to download favicon for ${domain}, using default`);
      // 返回预期路径，但文件实际上不存在
      callback(null, faviconPath);
      return;
    }
    
    const currentUrl = urls[currentIndex];
    debugLog(`Trying to download favicon from: ${currentUrl}`);
    
    https.get(currentUrl, { timeout: 5000 }, res => {
      debugLog(`Response status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}`);
      
      // 处理重定向
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          debugLog(`Redirecting to: ${redirectUrl}`);
          res.resume(); // 消耗当前响应
          // 递归调用，尝试重定向后的 URL
          currentIndex = urls.length; // 停止当前循环
          https.get(redirectUrl, { timeout: 5000 }, redirectRes => {
            debugLog(`Redirect response status: ${redirectRes.statusCode}, Content-Type: ${redirectRes.headers['content-type']}`);
            if (redirectRes.statusCode === 200 && redirectRes.headers['content-type'] && 
                (redirectRes.headers['content-type'].includes('image') || redirectRes.headers['content-type'].includes('octet-stream'))) {
              const stream = fs.createWriteStream(faviconPath);
              redirectRes.pipe(stream);
              stream.on('finish', () => {
                stream.close();
                const stats = fs.statSync(faviconPath);
                if (stats.size < 100) {
                  debugLog(`Downloaded file too small (${stats.size} bytes), might be an error page`);
                  fs.unlinkSync(faviconPath);
                  callback(null, faviconPath);
                  return;
                }
                debugLog(`Favicon saved for ${domain} (${stats.size} bytes)`);
                callback(null, faviconPath);
              });
              stream.on('error', err => {
                console.error(`Error saving favicon: ${err.message}`);
                callback(null, faviconPath);
              });
            } else {
              redirectRes.resume();
              callback(null, faviconPath);
            }
          }).on('error', err => {
            console.error(`Error following redirect: ${err.message}`);
            callback(null, faviconPath);
          });
          return;
        }
      }
      
      if (res.statusCode === 200 && res.headers['content-type'] && 
          (res.headers['content-type'].includes('image') || res.headers['content-type'].includes('octet-stream'))) {
        const stream = fs.createWriteStream(faviconPath);
        let downloadedSize = 0;
        
        res.on('data', chunk => {
          downloadedSize += chunk.length;
        });
        
        res.pipe(stream);
        stream.on('finish', () => {
          stream.close();
          // 检查文件大小，如果太小（小于100字节）可能是错误页面
          const stats = fs.statSync(faviconPath);
          if (stats.size < 100) {
            debugLog(`Downloaded file too small (${stats.size} bytes), might be an error page`);
            fs.unlinkSync(faviconPath); // 删除无效文件
            currentIndex++;
            tryDownload();
            return;
          }
          debugLog(`Favicon saved for ${domain} (${stats.size} bytes)`);
          callback(null, faviconPath);
        });
        stream.on('error', err => {
          console.error(`Error saving favicon: ${err.message}`);
          currentIndex++;
          tryDownload();
        });
      } else {
        // 不是图片或状态码不对，尝试下一个 URL
        res.resume(); // 消耗数据以释放内存
        currentIndex++;
        tryDownload();
      }
    }).on('error', err => {
      console.error(`Error downloading favicon: ${err.message}`);
      currentIndex++;
      tryDownload();
    }).setTimeout(5000, () => {
      // 超时，尝试下一个
      debugLog(`Timeout downloading from ${currentUrl}`);
      currentIndex++;
      tryDownload();
    });
  }
  
  tryDownload();
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

  // favicon-middle.png
  if (pathname === '/favicon-middle.png') {
    const faviconPath = path.join(__dirname, 'favicon-middle.png');
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

  // 网站 favicon API - 使用 tabId/linkId 作为参数
  if (pathname.startsWith('/api/favicon/') && req.method === 'GET') {
    // 解析路径：/api/favicon/{tabId}/{linkId}?_ts=timestamp
    const pathWithoutQuery = pathname.split('?')[0]; // 移除查询参数
    const parts = pathWithoutQuery.replace('/api/favicon/', '').split('/');
    
    if (parts.length !== 2) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json;charset=utf-8');
      res.end(JSON.stringify({ error: 'Invalid path format. Expected: /api/favicon/{tabId}/{linkId}' }));
      return;
    }
    
    const tabId = parts[0];
    const linkId = parts[1];
    
    debugLog(`Favicon request for tabId: ${tabId}, linkId: ${linkId}`);
    
    // 从数据文件中查找对应的 URL
    const data = readData();
    let websiteUrl = null;
    
    debugLog(`Total tabs: ${data.tabs.length}`);
    
    // 在指定的 tab 中查找
    const targetTab = data.tabs.find(t => t.id.toString() === tabId);
    if (!targetTab) {
      debugLog(`Tab not found with ID: ${tabId}`);
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json;charset=utf-8');
      res.end(JSON.stringify({ error: 'Tab not found' }));
      return;
    }
    
    debugLog(`Checking tab: ${targetTab.name}, links count: ${targetTab.links.length}`);
    const link = targetTab.links.find(l => l.id.toString() === linkId);
    
    if (!link) {
      debugLog(`Link not found with ID: ${linkId} in tab ${tabId}`);
      debugLog(`Available link IDs in this tab:`, targetTab.links.map(l => l.id));
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json;charset=utf-8');
      res.end(JSON.stringify({ error: 'Link not found' }));
      return;
    }
    
    websiteUrl = link.url;
    debugLog(`Found link:`, link);
    
    const domain = extractDomain(websiteUrl);
    debugLog(`Favicon for link ${linkId}, URL: ${websiteUrl}, domain: ${domain}`);
    
    if (!domain) {
      console.error(`Invalid URL: ${websiteUrl}`);
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json;charset=utf-8');
      res.end(JSON.stringify({ error: 'Invalid URL' }));
      return;
    }
    
    const faviconPath = getFaviconPath(domain);
    debugLog(`Looking for favicon at: ${faviconPath}`);
    debugLog(`File exists: ${fs.existsSync(faviconPath)}`);
    
    // 辅助函数：返回默认图标
    function serveDefaultFavicon(res) {
      debugLog(`Serving default favicon from: ${DEFAULT_FAVICON}`);
      fs.readFile(DEFAULT_FAVICON, (err, content) => {
        if (err) {
          res.statusCode = 404;
          res.end('Default favicon not found');
        } else {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.end(content);
        }
      });
    }
    
    // 先检查本地是否有缓存
    if (fs.existsSync(faviconPath)) {
      debugLog(`✓ Using cached favicon for ${domain}`);
      // 有缓存，直接返回
      fs.readFile(faviconPath, (err, content) => {
        if (err) {
          console.error(`Error reading cached favicon: ${err.message}`);
          // 读取失败，返回默认图标
          serveDefaultFavicon(res);
        } else {
          debugLog(`Serving cached favicon (${content.length} bytes)`);
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天
          res.end(content);
        }
      });
    } else {
      debugLog(`✗ No cache found for ${domain}, starting download...`);
      // 没有缓存，先返回默认图标，然后在后台下载
      const expectedPath = getFaviconPath(domain);
      downloadFavicon(domain, (err, savedPath) => {
        // 检查文件是否真的被保存了
        if (fs.existsSync(savedPath)) {
          debugLog(`Download completed for ${domain}, saved to: ${savedPath}`);
        } else {
          debugLog(`Download failed for ${domain}, will use default favicon next time`);
        }
        // 下次请求时会使用新下载的图标（如果下载成功）
      });
      serveDefaultFavicon(res);
    }
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
          // 确保URL有协议
          const url = ensureUrlProtocol(item.url);
          currentTab.links.push({ id: Date.now(), name: item.name, url: url });
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
        debugLog('Updating bookmark:', { id, name, url });
        const data = readData();
        // 在当前tab中查找并更新
        const currentTab = data.tabs.find(t => t.id === data.currentTabId);
        if (currentTab) {
          const index = currentTab.links.findIndex(li => li.id === id);
          debugLog('Found index:', index);
          if (index !== -1) {
            const oldUrl = currentTab.links[index].url;
            currentTab.links[index].name = name;
            // 确保URL有协议
            const newUrl = ensureUrlProtocol(url);
            currentTab.links[index].url = newUrl;
            debugLog('Updated data:', data);
            writeData(data);
            debugLog('Data written successfully');
            
            // 始终触发 favicon 下载/刷新
            const domain = extractDomain(newUrl);
            if (domain) {
              debugLog(`Triggering favicon download for ${domain}`);
              // 如果 URL 发生变化，删除旧的 favicon 缓存
              if (oldUrl !== newUrl) {
                const oldDomain = extractDomain(oldUrl);
                if (oldDomain && oldDomain !== domain) {
                  const oldFaviconPath = getFaviconPath(oldDomain);
                  if (fs.existsSync(oldFaviconPath)) {
                    try {
                      fs.unlinkSync(oldFaviconPath);
                      debugLog(`Deleted old favicon: ${oldFaviconPath}`);
                    } catch (err) {
                      console.error(`Failed to delete old favicon: ${err.message}`);
                    }
                  }
                }
              }
              // 触发 favicon 下载（会检查缓存，如果已存在则直接使用）
              downloadFavicon(domain, (err, savedPath) => {
                if (fs.existsSync(savedPath)) {
                  debugLog(`Favicon ready for ${domain}: ${savedPath}`);
                } else {
                  debugLog(`Favicon download failed for ${domain}`);
                }
              });
            }
            
            res.end(JSON.stringify({ code: 0 }));
          } else {
            debugLog('Bookmark not found with id:', id);
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
        debugLog('Updating title to:', title);
        const data = readData();
        data.title = title;
        writeData(data);
        debugLog('Title updated successfully');
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
        debugLog('Updating order:', linkIds);
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
          debugLog('Order updated successfully');
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
        debugLog('Updating icon size to:', iconSize);
        const data = readData();
        data.iconSize = iconSize;
        writeData(data);
        debugLog('Icon size updated successfully');
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
        debugLog('Importing data...');
        
        // 验证数据结构 - 支持两种格式：旧的只有links的格式和新的包含tabs的格式
        if (!importedData.tabs && !importedData.links) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 1, message: 'Invalid data format' }));
          return;
        }
        
        const currentData = readData();
        
        // 如果导入的数据包含tabs结构
        if (importedData.tabs && Array.isArray(importedData.tabs)) {
          debugLog('Importing with tabs structure');
          
          // 合并tabs：对于每个导入的tab，检查是否已存在（根据id）
          importedData.tabs.forEach(importedTab => {
            // 查找当前数据中是否已存在相同id的tab
            const existingTab = currentData.tabs.find(t => t.id === importedTab.id);
            
            if (existingTab) {
              // 如果tab已存在，合并links（基于ID去重）
              const existingIds = new Set(existingTab.links.map(link => link.id));
              
              importedTab.links.forEach(link => {
                if (!existingIds.has(link.id)) {
                  existingTab.links.push(link);
                  existingIds.add(link.id);
                }
              });
            } else {
              // 如果tab不存在，添加新tab
              currentData.tabs.push(importedTab);
            }
          });
          
          // 更新标题（如果导入数据中有）
          if (importedData.title) {
            currentData.title = importedData.title;
          }
          
          // 更新图标大小（如果导入数据中有）
          if (importedData.iconSize) {
            currentData.iconSize = importedData.iconSize;
          }
          
          // 确保currentTabId有效
          if (importedData.currentTabId) {
            const tabExists = currentData.tabs.find(t => t.id === importedData.currentTabId);
            if (tabExists) {
              currentData.currentTabId = importedData.currentTabId;
            }
          }
          
          writeData(currentData);
          debugLog('Data with tabs imported successfully');
          res.end(JSON.stringify({ code: 0 }));
        } 
        // 如果导入的数据只有links（旧格式），则添加到当前tab
        else if (importedData.links && Array.isArray(importedData.links)) {
          debugLog('Importing with legacy links-only format');
          
          const currentTab = currentData.tabs.find(t => t.id === currentData.currentTabId);
          
          if (!currentTab) {
            res.statusCode = 404;
            res.end(JSON.stringify({ code: 1, message: 'Current tab not found' }));
            return;
          }
          
          // 获取当前tab已有的 ID 列表（用于去重）
          const existingIds = new Set(currentTab.links.map(link => link.id));
          
          // 过滤掉已存在的 ID，只保留新的
          const newLinks = [];
          let duplicateCount = 0;
          
          importedData.links.forEach(link => {
            if (!existingIds.has(link.id)) {
              newLinks.push(link);
              existingIds.add(link.id); // 添加到集合中，防止导入数据内部重复
            } else {
              duplicateCount++;
            }
          });
          
          debugLog(`Importing ${newLinks.length} new links, skipping ${duplicateCount} duplicates`);
          
          // 合并数据到当前tab
          currentTab.links = [...currentTab.links, ...newLinks];
          if (importedData.title) {
            currentData.title = importedData.title;
          }
          writeData(currentData);
          debugLog('Legacy data imported successfully');
          res.end(JSON.stringify({ code: 0, added: newLinks.length, skipped: duplicateCount }));
        }
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
        debugLog('Switching to tab:', tabId);
        const data = readData();
        const tab = data.tabs.find(t => t.id === tabId);
        if (tab) {
          data.currentTabId = tabId;
          writeData(data);
          debugLog('Tab switched successfully');
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
        debugLog('Adding tab:', name);
        const data = readData();
        const newTab = {
          id: Date.now(),
          name: name,
          links: []
        };
        data.tabs.push(newTab);
        data.currentTabId = newTab.id; // 自动切换到新tab
        writeData(data);
        debugLog('Tab added successfully');
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
        debugLog('Deleting tab:', tabId);
        const data = readData();
        
        // 至少保留一个tab
        if (data.tabs.length <= 1) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 1, messageKey: 'atLeastOneTab' }));
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
          res.end(JSON.stringify({ 
            code: 1, 
            messageKey: 'tabHasLinks',
            linkCount: tabToDelete.links.length
          }));
          return;
        }
        
        // 删除tab
        data.tabs.splice(tabIndex, 1);
        
        // 如果删除的是当前tab，切换到第一个tab
        if (data.currentTabId === tabId && data.tabs.length > 0) {
          data.currentTabId = data.tabs[0].id;
        }
        
        writeData(data);
        debugLog('Tab deleted successfully');
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
        debugLog('Updating tab order:', tabIds);
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
        debugLog('Tab order updated successfully');
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
        debugLog('Updating tab name:', tabId, name);
        const data = readData();
        const tab = data.tabs.find(t => t.id === tabId);
        if (tab) {
          tab.name = name;
          writeData(data);
          debugLog('Tab name updated successfully');
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
        debugLog('Moving link:', linkId, 'from', fromTabId, 'to', toTabId);
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
        debugLog('Link moved successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        console.error('Move link error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 获取配置
  if (pathname === '/api/getConfig' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    try {
      const configData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      res.end(JSON.stringify({ 
        code: 0, 
        port: configData.port || 8080,
        debug: configData.debug || false
      }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ code: 1, message: 'Failed to read config' }));
    }
    return;
  }

  // 获取常量配置
  if (pathname === '/api/getConstants' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    try {
      // 每次请求时重新读取，确保获取最新值
      const constantsData = JSON.parse(fs.readFileSync(CONSTANT_FILE, 'utf8'));
      res.end(JSON.stringify({ 
        code: 0, 
        version: constantsData.version || '1.0.0',
        copyright: constantsData.copyright || '(c) DSH - MyBookmark',
        url: constantsData.url || ''
      }));
    } catch (err) {
      console.error('Failed to read constants:', err);
      res.end(JSON.stringify({ 
        code: 0, 
        version: '1.0.0',
        copyright: '(c) DSH - MyBookmark',
        url: ''
      }));
    }
    return;
  }

  // 保存配置
  if (pathname === '/api/saveConfig' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { port, debug } = JSON.parse(body);
        debugLog('Saving config:', { port, debug });
        
        // 验证端口
        const portNum = parseInt(port);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 1, message: 'Invalid port number' }));
          return;
        }
        
        // 更新配置
        const newConfig = {
          port: portNum,
          debug: debug === true || debug === 'true'
        };
        
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');
        debugLog('Config saved successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        console.error('Save config error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 刷新 Favicon
  if (pathname === '/api/refreshFavicon' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { linkId } = JSON.parse(body);
        debugLog(`Refresh favicon request for link ID: ${linkId}`);
        
        // 从数据文件中查找对应的 URL
        const data = readData();
        let websiteUrl = null;
        
        // 在所有 tabs 中查找
        for (const tab of data.tabs) {
          const link = tab.links.find(l => l.id.toString() === linkId.toString());
          if (link) {
            websiteUrl = link.url;
            break;
          }
        }
        
        if (!websiteUrl) {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Link not found' }));
          return;
        }
        
        const domain = extractDomain(websiteUrl);
        if (!domain) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 1, message: 'Invalid URL' }));
          return;
        }
        
        debugLog(`Refreshing favicon for ${domain} (${websiteUrl})`);
        
        // 删除现有缓存（如果存在）
        const faviconPath = getFaviconPath(domain);
        if (fs.existsSync(faviconPath)) {
          try {
            fs.unlinkSync(faviconPath);
            debugLog(`Deleted cached favicon: ${faviconPath}`);
          } catch (err) {
            console.error(`Failed to delete cached favicon: ${err.message}`);
          }
        }
        
        // 触发新的下载
        downloadFavicon(domain, (err, savedPath) => {
          if (fs.existsSync(savedPath)) {
            debugLog(`Favicon refreshed for ${domain}, saved to: ${savedPath}`);
          } else {
            debugLog(`Favicon refresh failed for ${domain}`);
          }
        });
        
        res.end(JSON.stringify({ code: 0, message: 'Favicon refresh started' }));
      } catch (err) {
        console.error('Refresh favicon error:', err);
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
  console.log('');
  console.log('========================================');
  console.log(`  ${constants.copyright} v${constants.version}`);
  if (constants.url) {
    console.log(`  ${constants.url}`);
  }
  console.log('========================================');
  console.log('');
  console.log(`服务已启动，访问：http://localhost:${PORT}`);
  console.log(`数据文件：${DATA_FILE}`);
  console.log(`配置文件：${CONFIG_FILE}`);
  console.log(`端口号：${config.port || 8080}`);
  console.log(`调试模式：${config.debug ? '开启' : '关闭'}`);
  console.log('');
});