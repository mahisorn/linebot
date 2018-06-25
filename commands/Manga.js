var axios = require('axios');
var mysql = require('mysql');
var pool = mysql.createPool(process.env.JAWSDB_URL);
const util = require('util');
const events = require('events');
var CronJob = require('cron').CronJob;
const Cmd = function (app) {
  events.EventEmitter.call(this);
  const _this = this;
  app.get('/manga/search/:q', (req, res) => {
    q("select id,name,tmb from manga where name like ? order by name asc", ['%' + req.params.q + '%']).then(rows => res.send(rows));
  });
  app.get('/manga/list/:uid', (req, res) => {
    q("select id,name,tmb from manga where id in(select mid from follow where uid=? ) order by name asc", [req.params.uid]).then(rows => res.send(rows));
  });
  // ใช้ที่เดียว ไม่ใช้ express-async-handler ดีกว่า
  app.post('/manga/list/:uid', async (req, res) => {
    try {
      await q("delete from follow where uid=?", [req.params.uid]);
      req.body.forEach(async mid => {
        await q("insert into follow(uid,mid) values(?,?)", [req.params.uid, mid]);
      });
      res.send('ok');
    } catch (e) {
      next(e)
    }
  });
  this.handleEvent = function (evt, cmd, param) {
    notify(['mrs-serie-134363','mrs-serie-184984']);
    _this.emit('replyMessage', {
      replyToken: evt.replyToken,
      message: {
        type: 'text',
        text: 'line://app/1526734026-V3AxnYZl'
      }
    });
  }
  async function getMangaList() {
    console.log('getMangaList');
    axios.post('https://api.mangarockhd.com/query/web400/mrs_filter', {
      "status": "all"
    }).then(async r => {
      r.data.data.forEach(async d => {
        await q(`insert ignore into manga(id) values('${d}')`);
      });
      getMangaInfo();
    }).catch(e => console.log(e));
  }
  async function getMangaUpdate() {
    console.log('getMangaUpdate');
    axios.get('https://api.mangarockhd.com/query/web400/mrs_latest').then(async r => {
      var ids = [],
        i = 150;
      r.data.data.forEach(d => {
        if (i > 0) ids.push(d.oid);
        i--;
      });
      getMangaInfo(ids);
    }).catch(e => console.log(e));
  }

  async function notify(mangaIds) {
    if (!mangaIds.length) return;
    var uId = '',
      txt = [];
    var rows = await q('select * from follow where mid in(' + Array(mangaIds.length).fill('?').join(',') + ')', mangaIds);
    rows.forEach(r => {
      if (uId != r.uid) {
        if (uId) _this.emit('pushMessage', {
          to: uId,
          message: {
            type: 'text',
            text: txt.join(`\n`)
          }
        });
        uId = r.uid;
        txt = [];
      }
      txt.push('https://mangarock.com/manga/' + r.mid);
    });
    if (uId) _this.emit('pushMessage', {
      to: uId,
      message: {
        type: 'text',
        text: txt.join(`\n`)
      }
    });
  }
  async function getMangaInfo(_ids) {
    var rows, ids, changed = [];
    if (_ids) {
      ids = _ids;
    } else {
      rows = await q("select id from manga where name=''");
      ids = rows.map(r => {
        return r.id
      });
    }
    axios.post('https://api.mangarockhd.com/meta', ids).then(async r => {
      for (var k in r.data.data) {
        var d = r.data.data[k];
        var row = await q('update manga set name=?,tmb=?,chapter=? where id=?', [d.name, d.thumbnail, d.total_chapters, d.oid]);
        if (row && row.changedRows) {
          changed.push(d.oid);
        }
      }
      notify(changed);
    }).catch(e => console.log(e));
  }

  function q() {
    var qStr = arguments[0];
    var dat = arguments[1];
    return new Promise((resolve) => {
      pool.getConnection(function (err, connection) {
        connection.query(qStr, dat, function (error, results, fields) {
          if (error) {
            console.log(error);
            resolve(null);
          } else {
            resolve(results);
          }
          connection.release();
        });
      });
    });
  }
  new CronJob({
    cronTime: '* * 59 * * *',
    onTick: getMangaUpdate,
    start: true,
    timeZone: 'Asia/Bangkok',
    runOnInit: true
  });
  new CronJob({
    cronTime: '* * 13 * * *',
    onTick: getMangaList,
    start: true,
    timeZone: 'Asia/Bangkok',
    runOnInit: false
  });
  util.inherits(Cmd, events.EventEmitter);
}
module.exports = Cmd;
