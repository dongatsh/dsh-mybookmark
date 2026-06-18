const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const https = require('https');
const crypto = require('crypto');

// 读取配置文件
const CONFIG_FILE = path.join(__dirname, 'config.json');
let config;
try {
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    logInfo('Config file loaded successfully.');
  } else {
    // 配置文件不存在，创建默认配置
    config = { port: 8080 };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    logInfo('Config file not exists, default config created.');
  }
} catch (err) {
  logError('Config file load fail, using default config:', err.message);
  config = { port: 8080 };
}

// 读取常量配置文件
const CONSTANT_FILE = path.join(__dirname, 'constant.json');
let constants;
try {
  constants = JSON.parse(fs.readFileSync(CONSTANT_FILE, 'utf8'));
} catch (err) {
  logWarn('常量配置文件加载失败，使用默认值');
  constants = { version: '1.0.0', copyright: '(c) DSH - MyBookmark' };
}

const PORT = config.port || 8080;
const DATA_FILE = path.join(__dirname, 'mybookmark.json');
const FAVICONS_DIR = path.join(__dirname, 'favicons');
const DEFAULT_FAVICON = path.join(__dirname, 'website.png');
const SETTING_FILE = path.join(__dirname, 'setting.ini');
const LOG_FILE = path.join(__dirname, 'mybookmark.log');

// 生成 ID（基于URL的MD5 hash值）
function generateIdFromUrl(urlStr) {
  if (!urlStr) {
    // 如果没有URL，回退到随机ID
    return Math.random().toString(16).substring(2, 18);
  }
  // 计算URL的MD5 hash值（32位十六进制字符串）
  return crypto.createHash('md5').update(urlStr).digest('hex');
}

// 生成随机 ID（16位十六进制字符串）- 用于Tab等不需要基于URL的场景
function generateRandomId() {
  return Math.random().toString(16).substring(2, 18);
}

// 确保 favicons 目录存在
if (!fs.existsSync(FAVICONS_DIR)) {
  fs.mkdirSync(FAVICONS_DIR, { recursive: true });
}

// 确保 setting.ini 文件存在
if (!fs.existsSync(SETTING_FILE)) {
  fs.writeFileSync(SETTING_FILE, '[system]\n# Debug mode: true or false\ndebug=false\n\n[favicon]\n# Format: domain=YYYY-MM-DD\n# Records domains where favicon download failed on a specific date\n# Failed favicons will not be retried on the same day\n', 'utf8');
}

// 读取 setting.ini 中的 favicon 失败记录
function readFaviconFailures() {
  try {
    const content = fs.readFileSync(SETTING_FILE, 'utf8');
    const failures = {};
    const lines = content.split('\n');
    let inFaviconSection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '[favicon]') {
        inFaviconSection = true;
        continue;
      }
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inFaviconSection = false;
        continue;
      }
      
      if (inFaviconSection && trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.+)$/);
        if (match) {
          const domain = match[1].trim();
          const date = match[2].trim();
          failures[domain] = date;
        }
      }
    }
    
    return failures;
  } catch (err) {
    logError('Failed to read setting.ini:', err.message);
    return {};
  }
}

// 写入 favicon 失败记录到 setting.ini
function writeFaviconFailure(domain, date) {
  try {
    const content = fs.readFileSync(SETTING_FILE, 'utf8');
    const lines = content.split('\n');
    let inFaviconSection = false;
    let updated = false;
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (trimmed === '[favicon]') {
        inFaviconSection = true;
        newLines.push(line);
        continue;
      }
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inFaviconSection = false;
        newLines.push(line);
        continue;
      }
      
      if (inFaviconSection && trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.+)$/);
        if (match && match[1].trim() === domain) {
          // 更新现有记录
          newLines.push(`${domain}=${date}`);
          updated = true;
          continue;
        }
      }
      
      newLines.push(line);
    }
    
    // 如果没有找到该域名的记录，添加到 [favicon] 小节末尾
    if (!updated && inFaviconSection) {
      newLines.push(`${domain}=${date}`);
    } else if (!updated) {
      // 如果不在任何小节中，添加到文件末尾
      newLines.push('[favicon]');
      newLines.push(`${domain}=${date}`);
    }
    
    fs.writeFileSync(SETTING_FILE, newLines.join('\n'), 'utf8');
    debugLog(`Recorded favicon failure for ${domain} on ${date}`);
  } catch (err) {
    logError('Failed to write setting.ini:', err.message);
  }
}

// 检查域名是否在当天已经失败过
function isFaviconFailedToday(domain) {
  const failures = readFaviconFailures();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const failedDate = failures[domain];
  
  return failedDate === today;
}

// 读取 setting.ini 中的 system 配置
function readSystemConfig() {
  try {
    const content = fs.readFileSync(SETTING_FILE, 'utf8');
    const config = {};
    const lines = content.split('\n');
    let inSystemSection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '[system]') {
        inSystemSection = true;
        continue;
      }
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inSystemSection = false;
        continue;
      }
      
      if (inSystemSection && trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.+)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          config[key] = value;
        }
      }
    }
    
    return config;
  } catch (err) {
    logError('Failed to read system config from setting.ini:', err.message);
    return { debug: 'false' };
  }
}

// 写入 system 配置到 setting.ini
function writeSystemConfig(key, value) {
  try {
    const content = fs.readFileSync(SETTING_FILE, 'utf8');
    const lines = content.split('\n');
    let inSystemSection = false;
    let updated = false;
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (trimmed === '[system]') {
        inSystemSection = true;
        newLines.push(line);
        continue;
      }
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inSystemSection = false;
        newLines.push(line);
        continue;
      }
      
      if (inSystemSection && trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.+)$/);
        if (match && match[1].trim() === key) {
          // 更新现有配置
          newLines.push(`${key}=${value}`);
          updated = true;
          continue;
        }
      }
      
      newLines.push(line);
    }
    
    // 如果没有找到该配置项，添加到 [system] 小节末尾
    if (!updated && inSystemSection) {
      newLines.push(`${key}=${value}`);
    } else if (!updated) {
      // 如果不在任何小节中，添加到文件末尾
      newLines.push('[system]');
      newLines.push(`${key}=${value}`);
    }
    
    fs.writeFileSync(SETTING_FILE, newLines.join('\n'), 'utf8');
    debugLog(`Updated system config: ${key}=${value}`);
  } catch (err) {
    logError('Failed to write system config to setting.ini:', err.message);
  }
}

// 格式化时间戳 [yyyy-MM-dd HH:mm:ss]
function formatTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}]`;
}

// 写入日志到文件
function writeLogToFile(message) {
  try {
    fs.appendFileSync(LOG_FILE, message + '\n', 'utf8');
  } catch (err) {
    // 如果写入失败，只在控制台输出错误
    console.error('Failed to write log file:', err.message);
  }
}

// 统一日志函数 - 带时间戳，同时输出到控制台和文件
function logInfo(...args) {
  const timestamp = formatTimestamp();
  const message = [timestamp, ...args].join(' ');
  console.log(message);
  writeLogToFile(message);
}

function logError(...args) {
  const timestamp = formatTimestamp();
  const message = [timestamp, ...args].join(' ');
  console.error(message);
  writeLogToFile('[ERROR] ' + message);
}

function logWarn(...args) {
  const timestamp = formatTimestamp();
  const message = [timestamp, ...args].join(' ');
  console.warn(message);
  writeLogToFile('[WARN] ' + message);
}

// 调试日志函数 - 每次调用时动态读取配置，同时输出到控制台和文件
function debugLog(...args) {
  try {
    const systemConfig = readSystemConfig();
    const debugMode = systemConfig.debug === 'true';
    if (debugMode) {
      const timestamp = formatTimestamp();
      const message = [timestamp, '[DEBUG]', ...args].join(' ');
      console.log(message);
      writeLogToFile(message);
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
      return { title: '我的收藏夹', tabs: [{ id: "default", name: '我的常用站点', links: data }] };
    }
    // 如果没有tabs，创建默认的tab
    if (!data.tabs || !Array.isArray(data.tabs) || data.tabs.length === 0) {
      data.tabs = [{ id: "default", name: '我的常用站点', links: data.links || [] }];
    }
    return data;
  } catch {
    // 如果文件不存在或解析失败，创建默认数据
    // 这里使用中文作为默认语言，前端会根据用户选择切换
    const defaultData = { 
      title: '我的收藏夹', 
      tabs: [{ id: "default", name: '我的常用站点', links: [] }] 
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

/**
 * 从域名中提取有意义的名称
 * @param {string} domain 完整域名
 * @returns {string} 提取后的名称
 */
function extractMeaningfulName(domain) {
  if (!domain) return 'New Bookmark';
  
  // 去除 www. 前缀
  let name = domain.replace(/^www\./, '');
  
  // 如果包含多个点，尝试提取主要部分
  const parts = name.split('.');
  
  if (parts.length >= 2) {
    // 定义常见的顶级域名和二级域名组合
    const compoundTlds = ['com.cn', 'org.cn', 'net.cn', 'gov.cn', 'edu.cn', 
                          'co.uk', 'co.jp', 'com.au', 'com.br', 'com.mx'];
    const simpleTlds = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'cn', 
                        'jp', 'uk', 'de', 'fr', 'it', 'es', 'ru', 'br', 'au', 
                        'me', 'tv', 'cc', 'xyz', 'top', 'info', 'biz'];
    
    // 检查是否是复合顶级域名（如 .com.cn）
    const lastTwoParts = parts.slice(-2).join('.').toLowerCase();
    const lastPart = parts[parts.length - 1].toLowerCase();
    
    if (compoundTlds.includes(lastTwoParts)) {
      // 复合顶级域名：example.com.cn → example
      // 如果有子域名：zb.example.com.cn → example
      if (parts.length >= 3) {
        name = parts[parts.length - 3];
      } else {
        name = parts[0];
      }
    } else if (simpleTlds.includes(lastPart)) {
      // 简单顶级域名：example.com → example
      // 如果有子域名：zb.example.com → example
      if (parts.length >= 3) {
        // 有多个子域名时，取倒数第二部分（主域名）
        name = parts[parts.length - 2];
      } else {
        // 只有两部分，取第一部分
        name = parts[0];
      }
    } else {
      // 其他情况（如 .local, .dev 等），取第一部分或主要部分
      if (parts.length >= 3) {
        // 对于多段域名，取中间部分作为主要名称
        // 例如：zb.betatime.local → betatime
        name = parts[parts.length - 2];
      } else {
        name = parts[0];
      }
    }
  }
  
  // 首字母大写
  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  return name || 'New Bookmark';
}

/**
 * 清理标题，提取分隔符之前的内容
 * @param {string} title 原始标题
 * @returns {string} 清理后的标题
 */
function cleanTitle(title) {
  if (!title || title.trim() === '') return '';
  
  // 定义常见的分隔符（按优先级排序）
  const separators = [
    '(',     // 英文左括号（优先处理）
    '（',     // 中文左括号（优先处理）
    '-',   // 英文破折号
    '–',   // En dash
    '—',   // Em dash
    ':',    // 英文冒号
    '：',    // 中文冒号
    '|',     // 竖线
    '·',     // 中间点
  ];
  
  let cleanedTitle = title.trim();
  
  // 尝试每个分隔符，取第一个匹配的部分
  for (const separator of separators) {
    const index = cleanedTitle.indexOf(separator);
    if (index !== -1) {
      // 提取分隔符之前的内容
      cleanedTitle = cleanedTitle.substring(0, index).trim();
      logInfo(`🔧 Split by "${separator}" at position ${index}`);
      break;
    }
  }
  
  // 如果提取后为空，返回原标题
  const result = cleanedTitle || title.trim();
  logInfo(`📝 Title after cleaning: "${result}"`);
  return result;
}

/**
 * 从网站获取标题和 favicon
 * @param {string} siteUrl 目标网址
 * @returns {Promise<{title: string, favicon: string}>}
 */
function getMetaFromWebsite(siteUrl) {
  return new Promise((resolve, reject) => {
    try {
      logInfo(`🌐 Fetching meta from: ${siteUrl}`);
      const urlObj = new URL(siteUrl);
      const opt = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        protocol: urlObj.protocol,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000 // 10秒超时
      };

      // https需要引入https模块，这里兼容处理
      const reqLib = urlObj.protocol === 'https:' ? https : http;

      let html = '';
      const req = reqLib.get(opt, (res) => {
        logInfo(`📡 Response status: ${res.statusCode} for ${siteUrl}`);
        
        // 处理重定向
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            logInfo(`↩️ Redirecting to: ${redirectUrl}`);
            res.resume(); // 消耗当前响应
            // 递归调用，尝试重定向后的 URL
            getMetaFromWebsite(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (res.statusCode !== 200) {
          logInfo(`⚠️ Failed to fetch ${siteUrl}, status: ${res.statusCode}`);
          resolve({ title: '', favicon: '' });
          return;
        }

        // 处理编码
        res.setEncoding('utf8');
        res.on('data', chunk => html += chunk);
        res.on('end', () => {
          try {
            logInfo(`📄 Received ${html.length} bytes from ${siteUrl}`);
            
            // 1.匹配标题 <title>内容</title>
            let title = '';
            const titleReg = /<title[^>]*>([\s\S]*?)<\/title>/i;
            const titleMatch = html.match(titleReg);
            if (titleMatch && titleMatch[1]) {
              title = titleMatch[1].trim();
              // 去除多余的空白字符
              title = title.replace(/\s+/g, ' ');
              logInfo(`📝 Found original title: "${title}"`);
              
              // 清理标题，提取分隔符之前的内容
              title = cleanTitle(title);
              logInfo(`✨ Cleaned title: "${title}"`);
            } else {
              logInfo(`⚠️ No title tag found`);
            }

            // 2.匹配 favicon link
            let faviconHref = '';
            // 匹配 rel="icon|shortcut icon" 的link标签href
            const iconReg = /<link[^>]+?rel=(["'])(?:shortcut\s+icon|icon)\1[^>]+?href=(["'])(.*?)\2/gi;
            let match;
            while ((match = iconReg.exec(html)) !== null) {
              faviconHref = match[3];
              logInfo(`🖼️ Found favicon link: ${faviconHref}`);
              break; // 取第一个图标
            }

            // 相对路径转绝对地址
            let favicon = '';
            if (faviconHref) {
              try {
                favicon = new URL(faviconHref, urlObj.origin).href;
                logInfo(`✅ Favicon URL: ${favicon}`);
              } catch (e) {
                logInfo(`❌ Invalid favicon URL: ${faviconHref}`);
              }
            } else {
              // 默认根目录 favicon.ico
              favicon = new URL('/favicon.ico', urlObj.origin).href;
              logInfo(`⚠️ No favicon link found, using default: ${favicon}`);
            }

            logInfo(`✨ Extracted meta for ${siteUrl}: title="${title}", favicon="${favicon}"`);
            resolve({ title, favicon });
          } catch (err) {
            logError(`❌ Error parsing HTML for ${siteUrl}:`, err.message);
            resolve({ title: '', favicon: '' });
          }
        });
      });

      req.on('error', err => {
        logError(`❌ Error fetching ${siteUrl}:`, err.message);
        resolve({ title: '', favicon: '' }); // 失败时返回空值，不阻断添加流程
      });

      req.on('timeout', () => {
        logInfo(`⏱️ Timeout fetching ${siteUrl}`);
        req.destroy();
        resolve({ title: '', favicon: '' });
      });

      req.end();
    } catch (err) {
      logError(`❌ Error in getMetaFromWebsite:`, err.message);
      resolve({ title: '', favicon: '' });
    }
  });
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
  
  // 检查今天是否已经失败过
  if (isFaviconFailedToday(domain)) {
    debugLog(`⊘ Skipping favicon download for ${domain} - already failed today`);
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
      // 所有尝试都失败，记录到 setting.ini
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      debugLog(`Failed to download favicon for ${domain}, recording failure and using default`);
      writeFaviconFailure(domain, today);
      // 返回预期路径，但文件实际上不存在
      callback(null, faviconPath);
      return;
    }
    
    const currentUrl = urls[currentIndex];
    debugLog(`Trying to download favicon from: ${currentUrl}`);
    
    try {
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
                  logError(`Error saving favicon: ${currentUrl}: ${err.message}`);
                  callback(null, faviconPath);
                });
              } else {
                redirectRes.resume();
                callback(null, faviconPath);
              }
            }).on('error', err => {
              logError(`Error following redirect:${currentUrl}: ${err.message}`);
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
            logError(`Error saving favicon: ${err.message}`);
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
        logError(`Error downloading favicon: ${currentUrl}: ${err.message}`);
        currentIndex++;
        tryDownload();
      }).setTimeout(5000, () => {
        // 超时，尝试下一个
        debugLog(`Timeout downloading from ${currentUrl}`);
        currentIndex++;
        tryDownload();
      });
    } catch (err) {
      // 捕获 URL 无效等同步错误
      logError(`Invalid URL or request error: ${currentUrl}: ${err.message}`);
      currentIndex++;
      tryDownload();
    }
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
    const targetTab = data.tabs.find(t => t.id === tabId);
    if (!targetTab) {
      debugLog(`Tab not found with ID: ${tabId}`);
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json;charset=utf-8');
      res.end(JSON.stringify({ error: 'Tab not found' }));
      return;
    }
    
    debugLog(`Checking tab: ${targetTab.name}, links count: ${targetTab.links.length}`);
    const link = targetTab.links.find(l => l.id === linkId);
    
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
      logError(`Invalid URL: ${websiteUrl}`);
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
          logError(`Error reading cached favicon: ${err.message}`);
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

  // CSS 文件
  if (pathname === '/style.css') {
    res.setHeader('Content-Type', 'text/css;charset=utf-8');
    fs.readFile(path.join(__dirname, 'style.css'), (err, content) => {
      if (err) {
        res.statusCode = 404;
        res.end('CSS file not found');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天
        res.end(content);
      }
    });
    return;
  }

  // 获取所有收藏
  if (pathname === '/api/get' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    const data = readData();
    // 返回所有tabs，前端根据localStorage中的currentTabId决定显示哪个
    const response = {
      title: data.title,
      customTitle: data.customTitle || false, // 返回自定义标题标记
      tabs: data.tabs
    };
    res.end(JSON.stringify(response));
    return;
  }

  // 新增收藏
  if (pathname === '/api/add' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const item = JSON.parse(body);
        const data = readData();
        // 添加到指定tab
        const targetTab = data.tabs.find(t => t.id === item.tabId);
        if (targetTab) {
          // 确保URL有协议
          const url = ensureUrlProtocol(item.url);
          
          // 尝试从网站获取标题和 favicon
          let name = item.name;
          let shouldDownloadFavicon = true;
          
          // 如果用户没有提供名称，或者名称为空，则尝试从网站获取
          if (!name || name.trim() === '') {
            logInfo(`🔍 No name provided, fetching from website: ${url}`);
            let fetchedTitle = null; // 标记是否成功获取到标题
            
            try {
              const meta = await getMetaFromWebsite(url);
              if (meta.title && meta.title.trim() !== '') {
                // 只有当标题不为空且不是纯空白时才使用
                name = meta.title.trim();
                fetchedTitle = true;
                logInfo(`✅ Using fetched title: ${name}`);
              } else {
                logInfo(`⚠️ Website returned empty title`);
              }
              
              // 如果获取到了 favicon URL，尝试下载
              if (meta.favicon) {
                logInfo(`📸 Found favicon URL: ${meta.favicon}`);
                // 注意：这里的 favicon 是完整 URL，我们需要下载它
                // 但由于 downloadFavicon 只支持从域名下载 favicon.ico，我们仍然使用原有逻辑
              }
            } catch (err) {
              logError(`❌ Failed to fetch meta from ${url}:`, err.message);
              // 网络错误等情况，标记为未获取到标题
            }
            
            // 只有在无法获取标题时，才使用域名作为默认值
            if (!fetchedTitle) {
              const domain = extractDomain(url);
              name = domain ? extractMeaningfulName(domain) : 'New Bookmark';
              logInfo(`⚠️ Using default name: ${name}`);
            }
          } else {
            logInfo(`✏️ Using provided name: ${name}`);
          }
          
          const newLink = { id: generateIdFromUrl(url), name: name, url: url };
          // 如果有 note，也保存
          if (item.note) {
            newLink.note = item.note;
          }
          targetTab.links.push(newLink);
          writeData(data);
          
          // 异步下载 favicon（不阻塞响应）
          const domain = extractDomain(url);
          if (domain && shouldDownloadFavicon) {
            logInfo(`🌐 Triggering favicon download for ${domain}`);
            downloadFavicon(domain, (err, savedPath) => {
              if (fs.existsSync(savedPath)) {
                logInfo(`✅ Favicon ready for ${domain}: ${savedPath}`);
              } else {
                logInfo(`❌ Favicon download failed for ${domain}`);
              }
            });
          }
          
          res.end(JSON.stringify({ code: 0, name: name }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        logError('Add bookmark error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
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
        const { id, tabId } = JSON.parse(body);
        const data = readData();
        // 从指定tab中删除
        const targetTab = data.tabs.find(t => t.id === tabId);
        if (targetTab) {
          targetTab.links = targetTab.links.filter(li => li.id !== id);
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
    req.on('end', async () => {
      try {
        const { id, name, url, note, tabId } = JSON.parse(body);
        logInfo('Updating bookmark:', { id, name, url, note });
        const data = readData();
        // 在指定tab中查找并更新
        const targetTab = data.tabs.find(t => t.id === tabId);
        if (targetTab) {
          const index = targetTab.links.findIndex(li => li.id === id);
          logInfo('Found index:', index);
          if (index !== -1) {
            const oldUrl = targetTab.links[index].url;
            const oldName = targetTab.links[index].name;
            
            // 确保URL有协议
            const newUrl = ensureUrlProtocol(url);
            
            // 处理名称：如果名称为空，尝试从网站获取
            let finalName = name;
            if (!finalName || finalName.trim() === '') {
              logInfo(`🔍 No name provided in edit, fetching from website: ${newUrl}`);
              let fetchedTitle = null;
              
              try {
                const meta = await getMetaFromWebsite(newUrl);
                if (meta.title && meta.title.trim() !== '') {
                  finalName = meta.title.trim();
                  fetchedTitle = true;
                  logInfo(`✅ Using fetched title: ${finalName}`);
                } else {
                  logInfo(`⚠️ Website returned empty title`);
                }
              } catch (err) {
                logError(`❌ Failed to fetch meta from ${newUrl}:`, err.message);
              }
              
              // 只有在无法获取标题时，才使用域名作为默认值
              if (!fetchedTitle) {
                const domain = extractDomain(newUrl);
                finalName = domain ? extractMeaningfulName(domain) : oldName || 'New Bookmark';
                logInfo(`⚠️ Using default name: ${finalName}`);
              }
            } else {
              logInfo(`✏️ Using provided name: ${finalName}`);
            }
            
            targetTab.links[index].name = finalName;
            targetTab.links[index].url = newUrl;
            // 更新 note
            if (note !== undefined) {
              targetTab.links[index].note = note;
            }
            logInfo('Updated data:', data);
            writeData(data);
            logInfo('Data written successfully');
            
            // 始终触发 favicon 下载/刷新
            const domain = extractDomain(newUrl);
            if (domain) {
              logInfo(`🌐 Triggering favicon download for ${domain}`);
              // 如果 URL 发生变化，删除旧的 favicon 缓存
              if (oldUrl !== newUrl) {
                const oldDomain = extractDomain(oldUrl);
                if (oldDomain && oldDomain !== domain) {
                  const oldFaviconPath = getFaviconPath(oldDomain);
                  if (fs.existsSync(oldFaviconPath)) {
                    try {
                      fs.unlinkSync(oldFaviconPath);
                      logInfo(`🗑️ Deleted old favicon: ${oldFaviconPath}`);
                    } catch (err) {
                      logError(`Failed to delete old favicon: ${err.message}`);
                    }
                  }
                }
              }
              // 触发 favicon 下载（会检查缓存，如果已存在则直接使用）
              downloadFavicon(domain, (err, savedPath) => {
                if (fs.existsSync(savedPath)) {
                  logInfo(`✅ Favicon ready for ${domain}: ${savedPath}`);
                } else {
                  logInfo(`❌ Favicon download failed for ${domain}`);
                }
              });
            }
            
            res.end(JSON.stringify({ code: 0, name: finalName }));
          } else {
            logInfo('Bookmark not found with id:', id);
            res.statusCode = 404;
            res.end(JSON.stringify({ code: 1, message: 'Not found' }));
          }
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        logError('Update error:', err);
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
        // 标记为用户自定义标题，切换语言时不自动翻译
        data.customTitle = true;
        writeData(data);
        debugLog('Title updated successfully with customTitle flag');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        logError('Update title error:', err);
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
        const { linkIds, tabId } = JSON.parse(body);
        debugLog('Updating order:', linkIds);
        const data = readData();
        // 根据ID数组重新排序指定tab的links
        const targetTab = data.tabs.find(t => t.id === tabId);
        if (targetTab) {
          const newLinks = [];
          linkIds.forEach(id => {
            const link = targetTab.links.find(l => l.id === id);
            if (link) {
              newLinks.push(link);
            }
          });
          targetTab.links = newLinks;
          writeData(data);
          debugLog('Order updated successfully');
          res.end(JSON.stringify({ code: 0 }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        logError('Update order error:', err);
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
        debugLog('Icon size updated to:', iconSize);
        // iconSize 现在存储在 localStorage 中，不需要写入文件
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        logError('Update icon size error:', err);
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
                // 重新计算ID为URL的MD5 hash
                const newId = generateIdFromUrl(link.url);
                link.id = newId;
                
                if (!existingIds.has(newId)) {
                  existingTab.links.push(link);
                  existingIds.add(newId);
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
          
          // iconSize 和 currentTabId 现在存储在 localStorage 中，不需要从导入数据中恢复
          
          writeData(currentData);
          debugLog('Data with tabs imported successfully');
          res.end(JSON.stringify({ code: 0 }));
        } 
        // 如果导入的数据只有links（旧格式），则添加到当前tab
        else if (importedData.links && Array.isArray(importedData.links)) {
          debugLog('Importing with legacy links-only format');
          
          // 注意：由于 currentTabId 现在在 localStorage 中，后端无法确定当前tab
          // 前端应该在调用导入 API 时传递 tabId 参数
          const targetTab = currentData.tabs[0]; // 默认添加到第一个tab
          
          if (!targetTab) {
            res.statusCode = 404;
            res.end(JSON.stringify({ code: 1, message: 'Current tab not found' }));
            return;
          }
          
          // 获取当前tab已有的 ID 列表（用于去重）
          const existingIds = new Set(targetTab.links.map(link => link.id));
          
          // 过滤掉已存在的 ID，只保留新的
          const newLinks = [];
          let duplicateCount = 0;
          
          importedData.links.forEach(link => {
            // 重新计算ID为URL的MD5 hash
            const newId = generateIdFromUrl(link.url);
            link.id = newId;
            
            if (!existingIds.has(newId)) {
              newLinks.push(link);
              existingIds.add(newId); // 添加到集合中，防止导入数据内部重复
            } else {
              duplicateCount++;
            }
          });
          
          debugLog(`Importing ${newLinks.length} new links, skipping ${duplicateCount} duplicates`);
          
          // 合并数据到目标tab
          targetTab.links = [...targetTab.links, ...newLinks];
          if (importedData.title) {
            currentData.title = importedData.title;
          }
          writeData(currentData);
          debugLog('Legacy data imported successfully');
          res.end(JSON.stringify({ code: 0, added: newLinks.length, skipped: duplicateCount }));
        }
      } catch (err) {
        logError('Import error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 导入数据到指定选项卡
  if (pathname === '/api/importToTab' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { tabId, links } = JSON.parse(body);
        debugLog(`Importing ${links.length} links to tab ${tabId}...`);
        
        if (!tabId || !links || !Array.isArray(links)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 1, message: 'Invalid parameters' }));
          return;
        }
        
        const currentData = readData();
        
        // 查找目标选项卡
        const targetTab = currentData.tabs.find(t => t.id === tabId);
        if (!targetTab) {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
          return;
        }
        
        // 获取当前tab已有的 ID 列表（用于去重）
        const existingIds = new Set(targetTab.links.map(link => link.id));
        
        // 过滤掉已存在的 ID，只保留新的
        const newLinks = [];
        let duplicateCount = 0;
        
        links.forEach(link => {
          // 重新计算ID为URL的MD5 hash
          const newId = generateIdFromUrl(link.url);
          link.id = newId;
          
          if (!existingIds.has(newId)) {
            newLinks.push(link);
            existingIds.add(newId);
          } else {
            duplicateCount++;
          }
        });
        
        debugLog(`Adding ${newLinks.length} new links, skipping ${duplicateCount} duplicates`);
        
        // 将新链接添加到目标tab
        targetTab.links = [...targetTab.links, ...newLinks];
        writeData(currentData);
        
        debugLog('Links imported to tab successfully');
        res.end(JSON.stringify({ code: 0, added: newLinks.length, skipped: duplicateCount }));
      } catch (err) {
        logError('Import to tab error:', err);
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
          // currentTabId 现在存储在 localStorage 中，不需要写入文件
          debugLog('Tab switched successfully');
          res.end(JSON.stringify({ code: 0 }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        logError('Switch tab error:', err);
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
          id: generateRandomId(),
          name: name,
          links: []
        };
        data.tabs.push(newTab);
        // currentTabId 现在存储在 localStorage 中，不需要写入文件
        writeData(data);
        debugLog('Tab added successfully');
        res.end(JSON.stringify({ code: 0, tabId: newTab.id }));
      } catch (err) {
        logError('Add tab error:', err);
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
        
        // currentTabId 现在存储在 localStorage 中，不需要写入文件
        // 如果删除的是当前tab，前端需要处理切换逻辑
        
        writeData(data);
        debugLog('Tab deleted successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        logError('Delete tab error:', err);
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
        logError('Update tab order error:', err);
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
        logError('Update tab name error:', err);
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
        logError('Move link error:', err);
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
        copyright: configData.copyright || ''
      }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ code: 1, message: 'Failed to read config' }));
    }
    return;
  }

  // 获取系统配置
  if (pathname === '/api/getSystemConfig' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    try {
      const systemConfig = readSystemConfig();
      res.end(JSON.stringify({ 
        code: 0, 
        debug: systemConfig.debug === 'true'
      }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ code: 1, message: 'Failed to read system config' }));
    }
    return;
  }

  // 获取常量配置
  if (pathname === '/api/getConstants' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    try {
      // 每次请求时重新读取，确保获取最新值
      const constantsData = JSON.parse(fs.readFileSync(CONSTANT_FILE, 'utf8'));
      
      // 尝试从 config.json 读取自定义版权信息
      let copyright = constantsData.copyright || '(c) DSH - MyBookmark';
      try {
        const configData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        if (configData.copyright) {
          copyright = configData.copyright;
        }
      } catch (err) {
        // 如果 config.json 不存在或读取失败，使用 constant.json 的值
      }
      
      res.end(JSON.stringify({ 
        code: 0, 
        version: constantsData.version || '1.0.0',
        copyright: copyright,
        url: constantsData.url || ''
      }));
    } catch (err) {
      logError('Failed to read constants:', err);
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
        const { copyright } = JSON.parse(body);
        debugLog('Saving config:', { copyright });
        
        // 读取现有配置
        let existingConfig = {};
        try {
          existingConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (err) {
          // 如果读取失败，使用空对象
        }
        
        // 更新配置到 config.json（保留原有端口）
        const newConfig = {
          port: existingConfig.port || 8080
        };
        
        // 如果提供了版权信息，保存到配置中
        if (copyright !== undefined) {
          newConfig.copyright = copyright;
        }
        
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');
        
        debugLog('Config saved successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        logError('Save config error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 保存系统配置
  if (pathname === '/api/saveSystemConfig' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { debug } = JSON.parse(body);
        debugLog('Saving system config:', { debug });
        
        // 将 debug 设置保存到 setting.ini
        if (debug !== undefined) {
          writeSystemConfig('debug', debug === true || debug === 'true' ? 'true' : 'false');
        }
        
        debugLog('System config saved successfully');
        res.end(JSON.stringify({ code: 0 }));
      } catch (err) {
        logError('Save system config error:', err);
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
        const { linkId, tabId } = JSON.parse(body);
        debugLog(`Refresh favicon request for link ID: ${linkId}, tabId: ${tabId}`);
        
        // 从数据文件中查找对应的 URL
        const data = readData();
        let websiteUrl = null;
        
        // 优先在指定 tab 中查找，如果没找到则在所有 tabs 中查找
        if (tabId) {
          const targetTab = data.tabs.find(t => t.id === tabId);
          if (targetTab) {
            const link = targetTab.links.find(l => l.id === linkId);
            if (link) {
              websiteUrl = link.url;
            }
          }
        }
        
        // 如果在指定 tab 中没找到，在所有 tabs 中查找
        if (!websiteUrl) {
          for (const tab of data.tabs) {
            const link = tab.links.find(l => l.id === linkId);
            if (link) {
              websiteUrl = link.url;
              break;
            }
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
            logError(`Failed to delete cached favicon: ${err.message}`);
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
        logError('Refresh favicon error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ code: 1, message: 'Server error' }));
      }
    });
    return;
  }

  // 切换卡片锁定状态
  if (pathname === '/api/toggleLock' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { linkId, tabId, locked } = JSON.parse(body);
        debugLog(`Toggle lock request for link ID: ${linkId}, tabId: ${tabId}, locked: ${locked}`);
        
        const data = readData();
        
        // 在指定 tab 中查找并更新锁定状态
        const targetTab = data.tabs.find(t => t.id === tabId);
        if (targetTab) {
          const index = targetTab.links.findIndex(li => li.id === linkId);
          if (index !== -1) {
            // 设置或移除 locked 属性
            if (locked === true) {
              targetTab.links[index].locked = true;
            } else {
              delete targetTab.links[index].locked;
            }
            
            writeData(data);
            debugLog(`Lock status updated for link ${linkId}: ${locked}`);
            res.end(JSON.stringify({ code: 0 }));
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ code: 1, message: 'Link not found' }));
          }
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 1, message: 'Tab not found' }));
        }
      } catch (err) {
        logError('Toggle lock error:', err);
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
  const timestamp = formatTimestamp();
  logInfo('');
  logInfo('========================================');
  logInfo(`  ${constants.copyright} v${constants.version}`);
  if (constants.url) {
    logInfo(`  ${constants.url}`);
  }
  logInfo('========================================');
  logInfo('');
  logInfo(`Service started: http://localhost:${PORT}`);
  logInfo(`DataFile: ${DATA_FILE}`);
  logInfo(`ConfigFile: ${CONFIG_FILE}`);
  logInfo(`SettingFile: ${SETTING_FILE}`);
  logInfo(`Port: ${config.port || 8080}`);
  
  // 从 setting.ini 读取 debug 配置
  const systemConfig = readSystemConfig();
  const debugMode = systemConfig.debug === 'true';
  logInfo(`DebugMode：${debugMode ? 'ENABLED' : 'DISABLED'}`);
  logInfo('');
});