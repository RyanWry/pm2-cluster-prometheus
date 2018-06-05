'use strict'

const pmx = require('pmx')
const pm2 = require('pm2')
const consul = require('./lib/consul')
const promClient = require('prom-client')
const AggregatorRegistry = promClient.AggregatorRegistry

const http = require('http')
const url = require("url")
const querystring = require('querystring')

const GET_METRICS_REQ = 'prom:getMetricsReq'
const GET_METRICS_RES = 'prom:getMetricsRes'
let requestCtr = 0
const requests = new Map()

pmx.initModule({

    widget: {

        // Logo displayed
        logo: 'https://app.keymetrics.io/img/logo/keymetrics-300.png',

        // Module colors
        // 0 = main element
        // 1 = secondary
        // 2 = main border
        // 3 = secondary border
        theme: ['#141A1F', '#222222', '#3ff', '#3ff'],

        // Section to show / hide
        el: {
            probes: true,
            actions: true
        },

        // Main block to show / hide
        block: {
            actions: false,
            issues: true,
            meta: true,
        }

    },

}, function (err, conf) {
    if (err) return console.error(err)

    const sendWokerRequest = (id, requestId) => {

        pm2.sendDataToProcessId({
            id: id,
            type: GET_METRICS_REQ,
            data: {
                requestId
            },
            topic: 'Get worker metrics'
        }, err => {
            if (err) console.error('send worker message error', err)
        })
    }


    const requestHandler = (req, res) => {
        const pathname = url.parse(req.url).pathname
        const query = querystring.parse(url.parse(req.url).query)

        if (pathname === '/online') {return res.end('ok')}
        if (pathname !== '/metrics') {
            res.statusCode = 404
            return res.end()
        }

        const requestId = requestCtr++

        const done = (err, result) => {
            if (err) {
                return res.end(err.message)
            }

            res.writeHead(200, {'Content-Type': promClient.register.contentType})
            res.end(result)
        }


        const request = {
            responses: [],
            done,
            errorTimeout: setTimeout(() => {
                request.failed = true
                request.done(new Error('time out'))
                requests.delete(requestId)
            }, 5000),
            failed: false
        }


        if (query.pm_id) {
            request.pending = 1
            requests.set(requestId, request)

            sendWokerRequest(Number(query.pm_id), requestId)
        } else {

            pm2.list((err, apps) => {
                if (err) return res.end(err.message)

                const workers = apps.filter(app => {
                    return typeof app.pm2_env.axm_options.isModule === 'undefined'
                        && conf.app_name.indexOf(app.name) !== -1
                })

                if (workers.length === 0) return setImmediate(() => done(null, 'no metrics'))

                request.pending = workers.length
                requests.set(requestId, request)

                workers.forEach(worker => {

                    sendWokerRequest(worker.pm_id, requestId)
                })
            })
        }
    }

    pm2.launchBus((err, bus) => {

        bus.on(GET_METRICS_RES, message => {
            const request = requests.get(message.data.requestId)
            if (!request) return

            request.responses.push(message.data.metrics)
            request.pending--

            if (request.pending === 0) {

                requests.delete(message.data.requestId)
                clearTimeout(request.errorTimeout)

                if (request.failed) return

                try {
                    const registry = AggregatorRegistry.aggregate(request.responses)
                    const promString = registry.metrics()
                    request.done(null, promString)
                } catch (err) {
                    request.done(new Error('aggregate error prom-client version require >= 11.0.0'))
                }
            }
        })
    })

    const app = http.createServer(requestHandler)

    app.listen(conf.port, err => {
        if (err) console.error('server start error', err)
        console.log('server listen on', conf.port)

        if (conf.register_mode === 'cluster') {
            consul.startRegister(conf)
        } else {
            consul.deregister(conf)

            pm2.list((err, apps) => {
                if (err) return res.end(err.message)
    
                const workers = apps.filter(app => {
                    return typeof app.pm2_env.axm_options.isModule === 'undefined'
                        && conf.app_name.indexOf(app.name) !== -1
                })
    
                workers.forEach(worker => {
                    consul.startRegister(conf, worker.pm_id)
                })
            })
        }
    })
})
