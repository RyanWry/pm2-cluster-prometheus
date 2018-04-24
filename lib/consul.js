'use strict'

const os = require('os')
const address = require('address')

const registerMe = (conf, consul) => {
    const serviceName = conf.consul_service_name

    const service = {
        id: `${serviceName}-${address.ip()}-${conf.port}`,
        name: serviceName,
        tags: ['pm2-cluster', process.env.NODE_ENV || 'development', os.hostname()],
        address: address.ip(),
        port: conf.port,
        check: {
            http: `http://${address.ip()}:${conf.port}/online`,
            interval: '15s',
            ttl: '60s'
        }
    }

    consul.agent.service.register(service, err => {
        if (err) console.error('consul register failed', err)
    })
}


exports.startRegister = function (conf) {

    if (conf.reigster_disabled) return
    const ttl = conf.ttl || 600

    const consul = require('consul')({
        host: conf.consul_host,
        port: conf.consul_port
    })

    setInterval(() => {
        registerMe(conf, consul)
    }, (ttl - 1) * 1000)
    registerMe(conf, consul)
}
