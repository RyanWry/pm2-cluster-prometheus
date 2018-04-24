'use strict'

const pmx = require('pmx')
const pm2 = require('pm2')
const consul = require('./lib/consul')
const promClient = require('prom-client')
const AggregatorRegistry = promClient.AggregatorRegistry

const http = require('http')
const url = require("url")

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

    const requestHandler = (req, res) => {
        const pathname = url.parse(req.url).pathname
        if (pathname === '/online') {return res.end('ok')}
        if (pathname !== '/metrics') {
            res.statusCode = 404
            return res.end()
        }

        const requestId = requestCtr++

        const done = (err, result) => {
            if (err) return res.end(err.message)

            res.writeHead(200, {'Content-Type': promClient.register.contentType})
            res.end(result)
        }


        pm2.list((err, apps) => {
            if (err) return res.end(err.message)

            const workers = apps.filter(app => {
                return typeof app.pm2_env.axm_options.isModule === 'undefined'
                    && conf.app_name.indexOf(app.name)!==-1
            })

            if (workers.length === 0) return setImmediate(() => done(null, ''))


            const request = {
                responses: [],
                pending: workers.length,
                done,
                errorTimeout: setTimeout(() => {
                    request.failed = true
                    request.done(new Error('time out'))
                }, 5000),
                failed: false
            }
            requests.set(requestId, request)

            workers.forEach(worker => {

                pm2.sendDataToProcessId({
                    id: worker.pm_id,
                    type: GET_METRICS_REQ,
                    data: {
                        requestId
                    },
                    topic: 'Get worker metrics'
                }, err => {
                    if (err) console.error('send worker message error', err)
                })
            })
        })
    }


    pm2.launchBus((err, bus) => {

        bus.on(GET_METRICS_RES, message => {
            const request = requests.get(message.data.requestId);
            request.responses.push(message.data.metrics)
            request.pending--

            if (request.pending === 0) {

                requests.delete(message.data.requestId)
                clearTimeout(request.errorTimeout)

                if (request.failed) return

                const registry = AggregatorRegistry.aggregate(request.responses)
                const promString = registry.metrics()
                request.done(null, promString)
            }
        })
    })

    const app = http.createServer(requestHandler)

    app.listen(conf.port, err => {
        if (err) console.error('server start error', err)
        console.log('server listen on', conf.port)
        consul.startRegister(conf)
    })

})
