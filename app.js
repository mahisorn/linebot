require('dotenv').config()
const express = require('express');
const line = require('@line/bot-sdk');
var CronJob = require('cron').CronJob;
var cloudinary = require('cloudinary'); //gif to mp4
//var _htmlparser = require("htmlparser2");//ไว้ parse ผลหวย
//var _request = require('request');
//================================
//        KEYS
//================================

//Convert GIF to MP4
var cloudconvert = new (require('cloudconvert'))(process.env.CLOUDCONVERT);
//Line API
const config = {
  channelAccessToken: process.env.LINEACCESS,
  channelSecret: process.env.LINESECRET
};
//Cloudinary GIF to MP4
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_KEY, 
  api_secret: process.env.CLOUDINARY_SECRET 
});
//================================

const app = express();
app.use(express.static('public'))
app.set('port', (process.env.PORT || 5000));


app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(
      (result) => res.json(result),
      (reject)=>{
        console.log('handleEvent func rejected');
        res.json('');
      }
    );
});

const client = new line.Client(config);
var url_radarvid = "";
var url_radar240 = "";
var url_radar800 = "";

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }
  //!rain - jpg
  if (event.type == 'message' && event.message.text == '!rain'){ 
      return client.replyMessage(event.replyToken, {
        "type": "image",
        "originalContentUrl": url_radar800,
        "previewImageUrl": url_radar240
      })};
    //!rainvid
  if (event.type == 'message' && event.message.text == '!rainvid'){ 
      return client.replyMessage(event.replyToken, {
        "type": "video",
        "originalContentUrl": url_radarvid,
        "previewImageUrl": url_radar240
      })};
};

//Upload Radar Images to CLOUDINARY every 11th min 
new CronJob('56 1,11,21,31,41,51 * * * *', function() { // sec min hr
    console.log('You will see this message every 11 mins');
    //UPLOAD GIF TO CLOUDINARY
    cloudinary.v2.uploader.upload("http://203.155.220.231/Radar/pics/nkradar.gif",{use_filename: true, unique_filename : true}, function(error, result) { 
    console.log("=====GIF UPLOADED=====")
    console.log(result.secure_url) 
    url_radarvid = result.secure_url.replace(".gif", ".mp4");
    });
    //UPLOAD Img & Resize to 800x800
    cloudinary.v2.uploader.upload("http://203.155.220.231/Radar/pics/nkzfiltered.jpg", {width:800, height: 800, crop: "scale", public_id: "radar800", use_filename: true, unique_filename : true}, function(error, result) { 
    console.log("=====IMAGE 800 UPLOADED=====")
    console.log(result.secure_url) 
    url_radar800 = result.secure_url;
    });
    //UPLOAD Img & Resize to 240x240
    cloudinary.v2.uploader.upload("http://203.155.220.231/Radar/pics/nkzfiltered.jpg", {width:240, height: 240, crop: "scale", public_id: "radar240", use_filename: true, unique_filename : true}, function(error, result) { 
    console.log("=====IMAGE 240 UPLOADED=====")
    console.log(result.secure_url) 
    url_radar240 = result.secure_url;
    });
        
    }, null, true, 'Asia/Bangkok');

app.get("*", function(req,res){
    res.send("Ong Line Bot");
});

//c9.io setting
//app.listen(process.env.PORT, process.env.IP, function(){
//    console.log("Server has started!");
//})

//Heroku setting
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
