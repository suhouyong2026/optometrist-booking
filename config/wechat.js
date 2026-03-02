/**
 * 微信 JS-SDK 配置
 * 
 * 此文件用于前端微信 JS-SDK 初始化配置
 * 实际签名由后端动态生成
 */

// 微信 JS-SDK 配置（前端使用）
const WechatConfig = {
  // 是否启用微信功能
  enabled: true,
  
  // 调试模式
  debug: false,
  
  // 需要使用的 JS-SDK 接口列表
  jsApiList: [
    'updateAppMessageShareData',
    'updateTimelineShareData',
    'startRecord',
    'stopRecord',
    'onRecordEnd',
    'playVoice',
    'pauseVoice',
    'stopVoice',
    'uploadVoice',
    'downloadVoice',
    'translateVoice',
    'recognizeVoice',
    'chooseImage',
    'previewImage',
    'uploadImage',
    'downloadImage',
    'getNetworkType',
    'openLocation',
    'getLocation',
    'hideOptionMenu',
    'showOptionMenu',
    'hideMenuItems',
    'showMenuItems',
    'hideAllNonBaseMenuItem',
    'showAllNonBaseMenuItem',
    'closeWindow',
    'scanQRCode',
    'chooseWXPay'
  ],
  
  // 分享配置
  share: {
    title: '验光师预约 - 天津标准眼镜',
    desc: '专业验光师许晓龙在线预约，和平路总店',
    link: window.location.href.split('#')[0],
    imgUrl: '' // 分享图标 URL
  }
};

// 初始化微信 JS-SDK
function initWechatSDK(config) {
  if (typeof wx === 'undefined') {
    console.error('微信 JS-SDK 未加载');
    return;
  }
  
  wx.config({
    debug: WechatConfig.debug,
    appId: config.appId,
    timestamp: config.timestamp,
    nonceStr: config.nonceStr,
    signature: config.signature,
    jsApiList: WechatConfig.jsApiList
  });
  
  wx.ready(function() {
    console.log('微信 JS-SDK 初始化成功');
    
    // 配置分享
    wx.updateAppMessageShareData({
      title: WechatConfig.share.title,
      desc: WechatConfig.share.desc,
      link: WechatConfig.share.link,
      imgUrl: WechatConfig.share.imgUrl,
      success: function() {
        console.log('分享菜单更新成功');
      }
    });
    
    wx.updateTimelineShareData({
      title: WechatConfig.share.title,
      link: WechatConfig.share.link,
      imgUrl: WechatConfig.share.imgUrl,
      success: function() {
        console.log('朋友圈分享菜单更新成功');
      }
    });
  });
  
  wx.error(function(res) {
    console.error('微信 JS-SDK 初始化失败:', res);
  });
}

// 获取微信 SDK 配置（从后端）
async function getWechatSDKConfig() {
  try {
    const response = await fetch('/api/wechat/js-sdk-config');
    const result = await response.json();
    
    if (result.success) {
      return result.config;
    } else {
      console.error('获取微信 SDK 配置失败:', result.message);
      return null;
    }
  } catch (error) {
    console.error('获取微信 SDK 配置失败:', error);
    return null;
  }
}

// 自动初始化（如果在微信内）
if (typeof wx !== 'undefined' && /micromessenger/i.test(navigator.userAgent)) {
  getWechatSDKConfig().then(config => {
    if (config) {
      initWechatSDK(config);
    }
  });
}

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WechatConfig;
}
