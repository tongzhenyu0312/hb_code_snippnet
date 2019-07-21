import axios from 'axios';
import authStore from '@/store/auth';
import env from '@/utils/env';
// import alipay from '@/utils/pay/alipay';
import config, { getSysTag } from '@/const/app.const';
import log from '@/utils/log';
import toast from '@/components/toast';
import Native from '@/utils/nativeProxy/index';
import UBT from '@/utils/ubt';

// console.log(authStore);

const CODE_MAPS = {
  101: '系统错误',
  102: '缺少参数',
  103: 'invalid token',
  104: '非法参数',
  801: '手机号无效',
  802: '亲，您已经参与过活动了，不要贪心哟！',
  803: '老用户',
  804: '已无优惠券',
  901: 'go back',
};

function encodeRequestData(data, needLogin) {
  if (!needLogin) {
    return Promise.resolve(data);
  }
  return new Promise(async (resolve, reject) => {
    try {
      if (data.token && data.ticket) {
        resolve(data);
      } else {
        const { token, ticket } = await Native.getTokenAndKey();
        resolve(Object.assign(data, { token, ticket }));
      }
    } catch (e) {
      /* eslint-disable */
      reject(e);
      console.log(e);
      /* eslint-enable */
    }
  });
}

export class CustomError extends Error {
  constructor({
    message,
    response,
    error,
    serverError
  }) {
    super(message);

    this.error = error;
    this.response = response;
    this.serverError = serverError;
    this.name = 'CustomError';
  }
}

export default class Request {
  static base(type, data, options, needLogin) {
    return new Promise((resolve, reject) => {
      const requestData = Object.assign({
        version: '1.1.0',
        from: 'h5',
        systemCode: env.systemCode,
        platform: 63,
        __sysTag: getSysTag(),
      }, data);

      const requestOptions = Object.assign({
        timeout: 0,
      }, options);

      const action = requestData.action || '';
      if (action.indexOf('&') !== -1) {
        requestData.action = action.substring(0, action.indexOf('&'));
      }
      encodeRequestData(requestData, needLogin).then((encodeData) => {
        const apiServer = (options && options.apiServer) || config.BASE_API;
        if (options && options['Content-Type']) {
          if (!requestOptions.headers) {
            requestOptions.headers = {};
          }
          requestOptions.headers['Content-Type'] = options['Content-Type'];
          if (options && options.paramsSerializer && typeof options.paramsSerializer === 'function') {
            requestOptions.paramsSerializer = options.paramsSerializer;
          }
        }
        const axiosPromise = type === 'get' ? axios[type](`${apiServer}?${action}`, {
          params: encodeData,
          ...requestOptions
        }) : axios[type](`${apiServer}?${action}`, encodeData, requestOptions);
        axiosPromise.then((res) => {
          const responseData = res.data;
          const { code } = responseData;
          if (code === 0) {
            resolve(responseData);
          } else if (code === 103) {
            authStore.reset();

            const err = new CustomError({
              message: '登录信息失效',
              response: res,
            });
            reject(err);

            toast.showError(err)
              .then(() => {
              });
          } else {
            let { msg } = responseData;
            let codeMsg = CODE_MAPS[code];
            if (!codeMsg) {
              codeMsg = `unknow code ${code}!`;
            }
            msg = msg || codeMsg;

            reject(new CustomError({
              message: msg,
              response: res,
              error: true,
            }));
          }
        })
          .catch((ex) => {
            UBT.send({
              action: requestData && requestData.action,
              apiServer,
              keyword: 'network_error_hitch',
              message: ex && JSON.stringify(ex),
              requestUrl: requestData.action || requestData.apiServer
            });
            if (axios.isCancel(ex)) {
              log.warn('请求被取消');
            } else {
              reject(new CustomError({
                message: '网络异常，请稍后重试',
                error: true,
                serverError: true,
              }));
            }
          });
      }, reject);
    });
  }

  static post(data, options, needLogin = false) {
    if (process.env.NODE_ENV !== 'pro') {
      // console.log(data);
    }
    return Request.base('post', data, options || {}, needLogin);
  }

  static get(data, options) {
    return Request.base('get', data, options || {});
  }
}
