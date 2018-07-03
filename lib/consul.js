'use strict'

const os = require('os')
const address = require('address')

const registerMe = (conf, consul, pmId) => {
    const serviceName = conf.consul_service_name

    let id = `${serviceName}-${address.ip()}-${conf.port}`
    let tags = ['pm2-cluster', process.env.NODE_ENV || 'development', 'host_' + os.hostname()]

    if (pmId !== undefined) {
        id += `-${pmId}`
        tags.push(`pmId_${pmId}`)
    }

    const service = {
        id: id,
        name: serviceName,
        tags: tags,
        address: address.ip(),
        port: conf.port,
        check: {
            http: `http://${address.ip()}:${conf.port}/online`,
            interval: '15s',
            ttl: '60s',
            deregistercriticalserviceafter: '10m'
        }
    }

    consul.agent.service.register(service, err => {
        if (err) console.error('consul register failed', err)
    })
}


exports.startRegister = function (conf, pmId) {

    if (conf.reigster_disabled) return
    const ttl = conf.ttl || 600

    const consul = require('consul')({
        host: conf.consul_host,
        port: conf.consul_port
    })

    registerMe(conf, consul, pmId)
}


exports.deregister = function (conf) {

    const consul = require('consul')({
        host: conf.consul_host,
        port: conf.consul_port
    })

    const serviceName = conf.consul_service_name
    let id = `${serviceName}-${address.ip()}-${conf.port}`

    consul.agent.service.deregister(id, err => {
        if (err) console.error('consul deregister failed', err)
    })
}