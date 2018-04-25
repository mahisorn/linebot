var axios = require('axios');
const util = require('util');
const events = require('events');
const jsdom = require('jsdom');
const {
  JSDOM
} = jsdom;
const redis = require("redis");
var redisClient = redis.createClient(process.env.REDISCLOUD_URL, {
  no_ready_check: true
});
/*
source:
2018-04-25T05:12:47.176935+00:00 app[web.1]:    { roomId: 'R65c3c57707ed952459bc73104999a762',
2018-04-25T05:12:47.176936+00:00 app[web.1]:      userId: 'Ud099a65459ece49825a844abef4a2dfc',
2018-04-25T05:12:47.176938+00:00 app[web.1]:      type: 'room' },
source:
2018-04-25T05:13:51.239272+00:00 app[web.1]:    { groupId: 'Ca54ac8bd20ac03a5d6a950ec1e141432',
2018-04-25T05:13:51.239274+00:00 app[web.1]:      userId: 'Ud099a65459ece49825a844abef4a2dfc',
2018-04-25T05:13:51.239276+00:00 app[web.1]:      type: 'group' },

source: { userId: 'Ud099a65459ece49825a844abef4a2dfc', type: 'user' },
*/
const Cmd = function () {
  events.EventEmitter.call(this);
  const _this = this;
  this.handleEvent = async function (evt, cmd, param) {
    if (!param) {
      _this.emit('replyMessage', {
        replyToken: evt.replyToken,
        message: {
          type: 'text',
          text: 'Please input BIB Number.'
        }
      });
    } else {
      var [utmfCmd, ...bibs] = param.toLowerCase().split(/[\s,]+/);
      var replyId = evt.source.userId;
      replyId = (evt.source.roomId) ? evt.source.roomId : replyId;
      replyId = (evt.source.groupId) ? evt.source.groupId : replyId;
      if (['add', 'list', 'del'].indexOf(utmfCmd) >= 0) {
        var settings = await getSettings();
        var isSettingChange = false;
        var ret = [];
        console.log('settings ' + JSON.stringify(settings, null, 2));
        if (utmfCmd == 'add') {
          var checkedBibs = await Promise.all(bibs.map(async _ => {
            return await runnerInfo(_);
          }));
          checkedBibs.map(_ => {
            if (!_.runner) return;
            var bib = _.runner.bib;
            settings[bib] = settings[bib] || [];
            if (settings[bib].indexOf(replyId) === -1) {
              ret.push('added :: ' + _.runner.bib + ' ' + _.runner.name);
              settings[bib].push(replyId);
              isSettingChange = true;
            }
          });
        }
        if (utmfCmd == 'del') {
          bibs.map(bib => {
            if (!settings[bib]) return;
            var idx = settings[bib].indexOf(replyId);
            if (idx !== -1) {
              ret.push('deleted :: ' + bib);
              settings[bib].splice(idx, 1);
              if (settings[bib].length == 0) delete(settings[bib]);
              isSettingChange = true;
            }
          });
        }
        if (utmfCmd == 'list') {
          var trackingBibs = [];
          for (var k in settings) {
            if (settings[k].indexOf(replyId) !== -1) trackingBibs.push(k);
            console.log(k);
          }
          var trackingRunners = await Promise.all(trackingBibs.map(async _ => {
            return await runnerInfo(_);
          }));
          if (trackingRunners.length) {
            ret.push('Tracking...');
            trackingRunners.map(_ => ret.push(_.runner.bib + ' ' + _.runner.name));
          }
          //console.log(trackingRunners);
        }
        if (isSettingChange) {
          console.log('settings ' + JSON.stringify(settings, null, 2));
          redisClient.set('utmf', JSON.stringify(settings), 'EX', 30 * 24 * 60 * 60);
        }
        if (!ret.length) return;
        _this.emit('replyMessage', {
          replyToken: evt.replyToken,
          message: {
            type: 'text',
            text: ret.join(`\n`)
          }
        });
      } else {
        var info = await runnerInfo(utmfCmd);
        if (info.runner) {
          _this.emit('replyMessage', {
            replyToken: evt.replyToken,
            message: {
              type: 'text',
              text: `${info.runner.name}
                ${info.runner.course}
                STATUS >> ${info.runner.status}`
            }
          });
        }
      }
    }
  };

  function getSettings() {
    return new Promise((resolve, reject) => {
      redisClient.get('utmf', function (err, _) {
        if (err || !_) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(_));
        } catch (e) {
          resolve({});
        }
      });
    });
  }

  function getRunnersInfo() {
    return new Promise((resolve, reject) => {
      redisClient.get('utmfRunnerInfo', function (err, _) {
        if (err || !_) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(_));
        } catch (e) {
          resolve({});
        }
      });
    });
  }

  function runnerInfo(_bib) {
    return new Promise((resolve, reject) => {
      let bib = encodeURI(_bib);
      let url = 'https://utmf.livetrail.net/coureur.php?rech=' + bib;
      let web = JSDOM.fromURL(url).then(dom => {
        let data = dom.window.document;
        if (!data.querySelector('state')) {
          resolve({});
          return;
        }
        let state = data.querySelector('state').getAttribute('code');
        if (state === 'a') {
          state = 'DNF';
        } else if (state === 'f') {
          state = 'FINISHED';
        } else {
          state = null;
        }
        let last = -1;
        let cp = [];
        let pts = data.querySelectorAll('pts pt').forEach(row => {
          cp.push({
            idpt: row.getAttribute('idpt'),
            n: row.getAttribute('n'),
            nc: row.getAttribute('nc'),
            km: row.getAttribute('km'),
            nc: row.getAttribute('nc')
          });
        });
        let pass = data.querySelectorAll('pass e').forEach((row, i) => {
          Object.assign(cp[i], {
            racetime: row.getAttribute('tps'),
            rank: row.getAttribute('clt'),
            worldtime: row.getAttribute('hd') || row.getAttribute('ha')
          });
          last = i;
        });
        // Last CP REACHED
        let runner = {
          bib: bib,
          name: data.querySelector('identite').getAttribute('prenom') + ' ' + data.querySelector('identite').getAttribute('nom'),
          course: data.querySelector('fiche').getAttribute('c').toUpperCase(),
          country: data.querySelector('identite').getAttribute('nat'),
          status: state,
          last_update: cp[last] || undefined
        };
        resolve({
          runner,
          data: cp
        });
      }).catch(error => {
        resolve({});
      });
    });
  }
  util.inherits(Cmd, events.EventEmitter);
};
module.exports = Cmd;