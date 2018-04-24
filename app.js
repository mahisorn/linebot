'use strict';
require('dotenv').config();

const LineEventHandler = require('./commands/EventHandler.js');
const Rain = require('./commands/Rain.js');
const Air = require('./commands/Air.js');
const MyLog = require('./commands/MyLog.js');
const WolframSolve = require('./commands/WolframSolve.js');
const Weather = require('./commands/Weather.js');

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const express = require('express');
const bodyParser = require('body-parser');
var urlencodedParser = bodyParser.urlencoded({
  extended: false
});

const line = require('@line/bot-sdk');
//================================
//        KEYS
//================================
//Line API
const config = {
  channelAccessToken: process.env.LINEACCESS,
  channelSecret: process.env.LINESECRET
};
const client = new line.Client(config);
var eventHandler = new LineEventHandler(client);
eventHandler.add(['rain', 'rainvid'], new Rain());
eventHandler.add('air', new Air());
eventHandler.add('log', new MyLog());
eventHandler.add('solve', new WolframSolve());
eventHandler.add(
  ['weather', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6'],
  new Weather()
);
const app = express();
app.use(express.static('public'));
app.set('port', process.env.PORT || 5000);
app.post('/webhook', line.middleware(config), (req, res) => {
  req.body.events.forEach(evt => eventHandler.handleEvent(evt));
  res.send('');
});

app.get('/utmfRunner', (req, res) => {
  // let url = 'https://utmb.livetrail.net/coureur.php?rech=' + req.params.bib;
  let url = 'https://utmf.livetrail.net/coureur.php?rech=' + req.params.bib;

  console.log(url);

  let web = JSDOM.fromURL(url)
    .then(dom => {
      let data = dom.window.document;
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
        name:
          data.querySelector('identite').getAttribute('prenom') +
          ' ' +
          data.querySelector('identite').getAttribute('nom'),
        course: data
          .querySelector('fiche')
          .getAttribute('c')
          .toUpperCase(),
        country: data.querySelector('identite').getAttribute('nat'),
        status: state,
        last_update: cp[last] || undefined
      };

      res.status(200).json({ runner, data: cp });
    })
    .catch(error => {
      console.log(error);
    });
});

app.get('*', function(req, res) {
  res.send('Ong Line Bot');
});

//Heroku setting
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
