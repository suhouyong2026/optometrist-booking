// API 配置
const API_BASE_URL = 'https://suhouyong2026-5gq178it64857137-1404541376.tcloudbaseapp.com';

// API 请求封装
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('API 请求失败:', error);
    throw error;
  }
}
