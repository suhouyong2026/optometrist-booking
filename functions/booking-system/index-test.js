// 测试版云函数
exports.main = async function(event, context) {
  return {
    code: 0,
    msg: 'success',
    data: { message: 'Hello World' }
  };
};
