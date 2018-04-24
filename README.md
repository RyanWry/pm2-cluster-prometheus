# pm2-cluster-prometheus
PM2 module to aggregate node.js workers' metrics when use pm2 cluster mode
## Install

```bash
$ pm2 install pm2-cluster-prometheus
```
## Configuration
Default settings:

```javascript
  "config": {
    "app_name": "api",             //需要拉取监控数据的 APP 名称
    "app_group": "book",           //consul 服务分组 
    "port": 3000,                  //http服务默认端口，提供 /metrics 和 /online 接口
    "reigster_disabled": false,    //是否禁止服务注册到 consul
    "consul_host": "127.0.0.1",    
    "consul_port": "8500"
  }
```
To modify the config values you can use the following commands:
```bash
pm2 set pm2-cluster-prometheus:app_name hello
pm2 set pm2-cluster-prometheus:port 4000
```

## Node.js APP
```javascript
const promClient = require('prom-client')

process.on('message', function (message) {
    if (message.type === 'prom:getMetricsReq') {
        process.send({
            type: 'prom:getMetricsRes',
            data: {
                requestId: message.data.requestId,
                metrics: promClient.register.getMetricsAsJSON()
            }
        })
    }
})
```

## Uninstall

```bash
$ pm2 uninstall pm2-cluster-prometheus
```
# License

MIT
