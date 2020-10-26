'use strict';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL;

//new text

// Imports dependencies and set up http server
const 
  { uuid } = require('uuidv4'),
  {format} = require('util'),
  request = require('request'),
  express = require('express'),
  body_parser = require('body-parser'),
  firebase = require("firebase-admin"),
  ejs = require("ejs"),  
  fs = require('fs'),
  multer  = require('multer'),  
  app = express(); 

const uuidv4 = uuid();


app.use(body_parser.json());
app.use(body_parser.urlencoded());

const bot_questions = {
  "q1": "For which date do you want to reserve? (dd-mm-yyyy)",
  "q2": "Please enter time you want to sing.(hh:mm am/pm)",
  "q3": "Please enter your name",
  "q4": "Please enter your phone number",
  "q5": "Please leave a message if you have something to tell us.",
  "q6": "Drop the song name and its artist. (Artist Name - Song Name)",
  "q7": "Please enter your REFERENCE CODE.",
  "q8": "How many sections do you want to take?"
  
}

let current_question = '';

let user_id = ''; 

let userInputs = [];


/*
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
})*/

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits :{
    fileSize: 50 * 1024 * 1024  //no larger than 5mb
  }

});

// parse application/x-www-form-urlencoded


app.set('view engine', 'ejs');
app.set('views', __dirname+'/views');


var firebaseConfig = {
     credential: firebase.credential.cert({
    "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "project_id": process.env.FIREBASE_PROJECT_ID,    
    }),
    databaseURL: process.env.FIREBASE_DB_URL,   
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  };



firebase.initializeApp(firebaseConfig);

let db = firebase.firestore(); 
let bucket = firebase.storage().bucket();

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));

// Accepts POST requests at /webhook endpoint
app.post('/webhook', (req, res) => {  

  // Parse the request body from the POST
  let body = req.body;

  

  // Check the webhook event is from a Page subscription
  if (body.object === 'page') {
    body.entry.forEach(function(entry) {

      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id; 

      user_id = sender_psid; 

      if(!userInputs[user_id]){
        userInputs[user_id] = {};
      }    


      if (webhook_event.message) {
        if(webhook_event.message.quick_reply){
            handleQuickReply(sender_psid, webhook_event.message.quick_reply.payload);
          }else{
            handleMessage(sender_psid, webhook_event.message);                       
          }                
      } else if (webhook_event.postback) {        
        handlePostback(sender_psid, webhook_event.postback);
      }
      
    });
    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');

  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});


app.use('/uploads', express.static('uploads'));


app.get('/',function(req,res){    
    res.send('your app is up and running');
});

app.get('/test',function(req,res){    
    res.render('test.ejs');
});

app.post('/test',function(req,res){
    const sender_psid = req.body.sender_id;     
    let response = {"text": "You  click delete button"};
    callSend(sender_psid, response);
});


/*********************************************
Start Reservation
**********************************************/
app.get('/admin/reservations', async function(req,res){
 
  const reservationsRef = db.collection('Reservations');
  const snapshot = await reservationsRef.get();

  if (snapshot.empty) {
    res.send('no data');
  } 

  let data = []; 

  snapshot.forEach(doc => {
    let reservation = {};
    reservation = doc.data();
    reservation.doc_id = doc.id;

    data.push(reservation);
    
  });

  console.log('DATA:', data);

  res.render('reservations.ejs', {data:data});
  
});

app.get('/admin/updatereservation/:doc_id', async function(req,res){
  let doc_id = req.params.doc_id; 
  
  const reservationsRef = db.collection('Reservations').doc(doc_id);
  const doc = await reservationsRef.get();
  if (!doc.exists) {
    console.log('No such document!');
  } else {
    console.log('Document data:', doc.data());
    let data = doc.data();
    data.doc_id = doc.id;

    console.log('Document data:', data);
    res.render('editreservation.ejs', {data:data});
  } 

});


app.post('/admin/updatereservation', function(req,res){
  console.log('REQ:', req.body); 

  

  let data = {
    name:req.body.name,
    phone:req.body.phone,
    package:req.body.package,
    date:req.body.date,
    time:req.body.time,
    sections:req.body.sections,
    message:req.body.message,
    status:req.body.status,
    doc_id:req.body.doc_id,
    ref:req.body.ref,
    comment:req.body.comment
  }

  db.collection('Reservations').doc(req.body.doc_id)
  .update(data).then(()=>{
      res.redirect('/admin/reservations');
  }).catch((err)=>console.log('ERROR:', error)); 
 
});
app.get('/admin/delete_reservation/:doc_id', function(req,res){
  
  let doc_id = req.params.doc_id; 

    db.collection("Reservations").doc(doc_id).delete().then(()=>{
      
        res.redirect('/admin/reservations');
        
    }).catch((err)=>console.log('ERROR:', error));   

});
/*********************************************
End Reservation
**********************************************/

/*********************************************
Start Req Songs
**********************************************/
app.get('/admin/reqsongs', async function(req,res){
 
  const reqsongsRef = db.collection('Song Requests');
  const snapshot = await reqsongsRef.get();

  if (snapshot.empty) {
    res.send('no data');
  } 

  let data = []; 

  snapshot.forEach(doc => {
    let reqsongs = {};
    reqsongs = doc.data();
    reqsongs.doc_id = doc.id;

    data.push(reqsongs);
    
  });

  console.log('DATA:', data);

  res.render('reqsongs.ejs', {data:data});
  
});

app.get('/admin/editreqsong/:doc_id', async function(req,res){
  let doc_id = req.params.doc_id; 
  
  const reqsongsRef = db.collection('Song Requests').doc(doc_id);
  const doc = await reqsongsRef.get();
  if (!doc.exists) {
    console.log('No such document!');
  } else {
    console.log('Document data:', doc.data());
    let data = doc.data();
    data.doc_id = doc.id;

    res.render('editreqsong.ejs', {data:data});
  } 

});


app.post('/admin/editreqsong', function(req,res){

  

  let data = {
    reqsong:req.body.reqsong,
    status:req.body.status,
  }

  db.collection('Song Requests').doc(req.body.doc_id)
  .update(data).then(()=>{
      res.redirect('/admin/reqsongs');
  }).catch((err)=>console.log('ERROR:', error)); 
 
});

app.get('/admin/delete_songreq/:doc_id', function(req,res){
  
  let doc_id = req.params.doc_id; 

    db.collection("Song Requests").doc(doc_id).delete().then(()=>{
      
        res.redirect('/admin/reqsongs');
        
    }).catch((err)=>console.log('ERROR:', error));   

});

/*********************************************
End Req Songs
**********************************************/


/*********************************************
Gallery page
**********************************************/
app.get('/showimages/:sender_id/',function(req,res){
    const sender_id = req.params.sender_id;

    let data = [];

    db.collection("images").limit(20).get()
    .then(  function(querySnapshot) {
        querySnapshot.forEach(function(doc) {
            let img = {};
            img.id = doc.id;
            img.url = doc.data().url;         

            data.push(img);                      

        });
        console.log("DATA", data);
        res.render('gallery.ejs',{data:data, sender_id:sender_id, 'page-title':'welcome to my page'}); 

    }
    
    )
    .catch(function(error) {
        console.log("Error getting documents: ", error);
    });    
});


app.post('/imagepick',function(req,res){
      
  const sender_id = req.body.sender_id;
  const doc_id = req.body.doc_id;

  console.log('DOC ID:', doc_id); 

  db.collection('images').doc(doc_id).get()
  .then(doc => {
    if (!doc.exists) {
      console.log('No such document!');
    } else {
      const image_url = doc.data().url;

      console.log('IMG URL:', image_url);

      let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the image you like?",
            "image_url":image_url,                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }

  
    callSend(sender_id, response); 
    }
  })
  .catch(err => {
    console.log('Error getting document', err);
  });
      
});



/*********************************************
END Gallery Page
**********************************************/

//webview test
app.get('/webview/:sender_id',function(req,res){
    const sender_id = req.params.sender_id;
    res.render('webview.ejs',{title:"Hello!! from WebView", sender_id:sender_id});
});

app.post('/webview',upload.single('file'),function(req,res){
       
      let name  = req.body.name;
      let email = req.body.email;
      let img_url = "";
      let sender = req.body.sender;  

      console.log("REQ FILE:",req.file);



      let file = req.file;
      if (file) {
        uploadImageToStorage(file).then((img_url) => {
            db.collection('webview').add({
              name: name,
              email: email,
              image: img_url
              }).then(success => {   
                console.log("DATA SAVED")
                thankyouReply(sender, name, img_url);    
              }).catch(error => {
                console.log(error);
              }); 
        }).catch((error) => {
          console.error(error);
        });
      }



     
      
      
           
});

//Set up Get Started Button. To run one time
//eg https://fbstarter.herokuapp.com/setgsbutton
app.get('/setgsbutton',function(req,res){
    setupGetStartedButton(res);    
});

//Set up Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/setpersistentmenu
app.get('/setpersistentmenu',function(req,res){
    setupPersistentMenu(res);    
});

//Remove Get Started and Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/clear
app.get('/clear',function(req,res){    
    removePersistentMenu(res);
});

//whitelist domains
//eg https://fbstarter.herokuapp.com/whitelists
app.get('/whitelists',function(req,res){    
    whitelistDomains(res);
});


// Accepts GET requests at the /webhook endpoint
app.get('/webhook', (req, res) => {
  

  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;  

  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];  
    
  // Check token and mode
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);    
    } else {      
      res.sendStatus(403);      
    }
  }
});

/**********************************************
Function to Handle when user send quick reply message
***********************************************/

function handleQuickReply(sender_psid, received_message) {

  console.log('QUICK REPLY', received_message);

  received_message = received_message.toLowerCase();

  if(received_message.startsWith("reserve:")){
    let reserve = received_message.slice(8);
    
    userInputs[user_id].reserve = reserve;
    
    current_question = 'q1';
    botQuestions(current_question, sender_psid);
  }else if(received_message.startsWith("package:")){
    let dept = received_message.slice(11);
    userInputs[user_id].package = dept;
    showPackages(sender_psid);
  }else{

      switch(received_message) {                
        case "on":
            showQuickReplyOn(sender_psid);
          break;


        case "preorder":
            showMenu(sender_psid);
          break;
        case "thankyou":
            showThanks(sender_psid);
          break;    



        case "off1":
            showQuickReplyOff1(sender_psid);
          break;
        case "off2":
            showQuickReplyOff2(sender_psid);
          break;   
        case "confirm-reservation":
              saveReservation(userInputs[user_id], sender_psid);
          break;  
        case "confirm-request":
              saveRequest(userInputs[user_id], sender_psid);
          break;
        case "track":         
      current_question = 'q7';
      botQuestions(current_question, sender_psid);
        break;                
        default:
            defaultReply(sender_psid);
    } 

  }
  
  
 
}

/**********************************************
Function to Handle when user send text message
***********************************************/

const handleMessage = (sender_psid, received_message) => {

  console.log('TEXT REPLY', received_message);
  //let message;
  let response;

  if(received_message.attachments){
     handleAttachments(sender_psid, received_message.attachments);
  }else if(current_question == 'q1'){
     console.log('DATE ENTERED',received_message.text);
     userInputs[user_id].date = received_message.text;
     current_question = 'q2';
     botQuestions(current_question, sender_psid);
  }else if(current_question == 'q2'){
     console.log('TIME ENTERED',received_message.text);
     userInputs[user_id].time = received_message.text;
     current_question = 'q8';
     botQuestions(current_question, sender_psid);
  }else if(current_question == 'q8'){
     console.log('SECTION ENTER',received_message.text);
     userInputs[user_id].sections = received_message.text;
     current_question = 'q3';
     botQuestions(current_question, sender_psid);   
  }else if(current_question == 'q3'){
     console.log('FULL NAME ENTERED',received_message.text);
     userInputs[user_id].name = received_message.text;
     current_question = 'q4';
     botQuestions(current_question, sender_psid);
  }else if(current_question == 'q4'){
     console.log('PHONE NUMBER ENTERED',received_message.text);
     userInputs[user_id].phone = received_message.text;
     current_question = 'q5';
     botQuestions(current_question, sender_psid);
  }else if(current_question == 'q5'){
     console.log('MESSAGE ENTERED',received_message.text);
     userInputs[user_id].message = received_message.text;
     current_question = '';    
     confirmReservation(sender_psid);
  
  }else if(current_question == 'q6'){
     console.log('ReqSong',received_message.text);
     userInputs[user_id].reqsong = received_message.text;
     current_question = '';
     confirmRequest(sender_psid);

  }else if(current_question == 'q7'){
     let reservation_ref = received_message.text; 
     console.log('reservation_ref: ', reservation_ref);    
     current_question = '';     
     showReservations(sender_psid, reservation_ref);
  }
     
     
  else {
      
      let user_message = received_message.text;      
     
      user_message = user_message.toLowerCase(); 

      switch(user_message) { 
      case "hi":
          hiReply(sender_psid);
        break;
      
      case "hospital":
          hospitalAppointment(sender_psid);
        break;                
      case "text":
        textReply(sender_psid);
        break;
      case "quick":
        quickReply(sender_psid);
        break;
      case "button":                  
        buttonReply(sender_psid);
        break;
      case "webview":
        webviewTest(sender_psid);
        break;       
      case "show images":
        showImages(sender_psid)
        break;               
      default:
          defaultReply(sender_psid);
      }       
          
      
    }

}

/*********************************************
Function to handle when user send attachment
**********************************************/


const handleAttachments = (sender_psid, attachments) => {
  
  console.log('ATTACHMENT', attachments);


  let response; 
  let attachment_url = attachments[0].payload.url;
    response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the right picture?",
            "subtitle": "Tap a button to answer.",
            "image_url": attachment_url,
            "buttons": [
              {
                "type": "postback",
                "title": "Yes!",
                "payload": "yes-attachment",
              },
              {
                "type": "postback",
                "title": "No!",
                "payload": "no-attachment",
              }
            ],
          }]
        }
      }
    }
    callSend(sender_psid, response);
}


/*********************************************
Function to handle when user click button
**********************************************/
const handlePostback = (sender_psid, received_postback) => { 

  

  let payload = received_postback.payload;

  console.log('BUTTON PAYLOAD', payload);

  
  if(payload.startsWith("packages:")){
    let package_name = payload.slice(9);
    console.log('SELECTED PACKAGE IS:', package_name);
    userInputs[user_id].package = package_name;
    console.log('TEST', userInputs);
    current_question = 'q1';
    botQuestions(current_question, sender_psid);
  }else{

      switch(payload) {
      case "start":
          list(sender_psid);
        break;         
      case "info":
          showBasicInfo(sender_psid);
        break; 
      case "list":
          showSongList(sender_psid);
        break; 
      case "packages":
          showPackages(sender_psid);
        break; 
      case "offer":
          showPromotion(sender_psid);
        break;

      case "request":
      current_question = 'q6';
      botQuestions(current_question, sender_psid);
        break;   

      case "track":         
      current_question = 'q7';
      botQuestions(current_question, sender_psid);
        break;

      default:
          defaultReply(sender_psid);
    } 

  }


  
}


const generateRandom = (length) => {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

/*********************************************
GALLERY SAMPLE
**********************************************/

const showImages = (sender_psid) => {
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "show images",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "enter",
                "url":"https://fbstarter.herokuapp.com/showimages/"+sender_psid,
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}


/*********************************************
END GALLERY SAMPLE
**********************************************/


function webviewTest(sender_psid){
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Click to open webview?",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "webview",
                "url":APP_URL+"webview/"+sender_psid,
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}


/**************
start KTV
**************/
const hiReply = (sender_psid) => {
    let response1 = {"text": "Welcome to MusicBox KTV & Bar. Let's create a good time together with friends and MUSIC!"};
     let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title":"So, shall we get started? ",
                  
            "buttons": [                
                  {
                "type": "postback",
                  "title": "Get Started",
                 
                  "payload": "start",          
              
                },    
                          
              ],
          }

          ]
        }
      }
    }
     callSend(sender_psid, response1).then(()=>{
        return callSend(sender_psid, response2)
      });
}

const list = (sender_psid) => {
    let response1 = {"text": "How may I help you?"};
    let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Show MusicBox KTV & Bar information. ",
            "image_url":"https://www.gomyanmartours.com/wp-content/uploads/2018/12/Music-Box-Karaoke-In-Yangon-3.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Basic Info",
                  "payload": "info",
                },               
              ],
          },{
            "title": "See our Giant Promotions.", 
            "image_url":"https://www.musicboxmn.com/wp-content/uploads/2019/04/mbpromoflyer.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Promotion",
                  "payload": "offer", 
                },               
              ],
          },{
            "title": "See Song List and Request.",
            "image_url":"https://cdn4.iconfinder.com/data/icons/jetflat-2-devices-vol-4/60/0093_036_album_music_media_song_songs-512.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Song List",
                  "payload": "list", 
                },               
              ],
          },{
            "title": "Many Exciting Lounge Packages to Pick. ",
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                  "payload": "packages", 
                },               
              ],
          },{
            "title": "Track my reservations.",
            "subtitle": "Show reservation info you have made.",
            "image_url":"https://static.vecteezy.com/system/resources/thumbnails/000/627/453/small/illust58-5815-01.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Track Reservation",
                  "payload": "track", 
                },               
              ],
          },
          ]
        }
      }
    }
  
 callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
}

const showBasicInfo = (sender_psid) => {
    let response1 = {"text": "Location: No.334, within Yangon International Hotel Compound, Ahlone Road, Ahlone Township, Yangon. "};
    let response2 = {"text": "Contact No.: 09453890776"};
    let response3 = {"text": "Operation Time: Everyday 11:00 AM - 2:00 AM"};
    let response4 = {"text": "Would you like to see song list and lounge packages?"};
    let response5 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "See Song List and Request ",
            "image_url":"https://cdn4.iconfinder.com/data/icons/jetflat-2-devices-vol-4/60/0093_036_album_music_media_song_songs-512.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Song List",
                  "payload": "list",
                },               
              ],
          },{
            "title": "Many Exciting Lounge Packages to Pick ",
              
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                  "payload": "packages", 
                },               
              ],
          }
        ]
      }
    }
  }
  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2).then(()=>{;
    return callSend(sender_psid, response3).then(()=>{;
    return callSend(sender_psid, response4).then(()=>{;
    return callSend(sender_psid, response5);
  });
  });
  });
  });
}         

const showSongList = (sender_psid) => {
    let response1 = {"text": "Here is the song list. You can also request the song you want to sing."};
    let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "See Song List or Request ?",
            "image_url":"https://cdn4.iconfinder.com/data/icons/jetflat-2-devices-vol-4/60/0093_036_album_music_media_song_songs-512.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Song List",
                  "payload": "list",
                },{
                  "type": "postback",
                  "title": "Song Request",
                  "payload": "request",
                }              
              ],
          },{
            "title": "Many Exciting Lounge Packages to Pick.", 
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                 
                  "payload": "packages", 
                },               
              ],
          }
        ]
      }
    }
  }
        callSend(sender_psid, response1).then(()=>{
        return callSend(sender_psid, response2)
      });
} 

     

const showPackages= (sender_psid) => {
    let response1 = {"text": "Explore the best lounge packages we offer."};
    let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Bronze Package",
            "subtitle": "small, 4 to 6 people, 35,000Ks per hour+ 2 water bottles ",
            "image_url":"https://jp-mm.drecomejp.com/uploads/picture/image/49417/14233863_10207382915035233_161325588_o.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve Now",                 
                  "payload": "packages: bronze",
                }              
              ],
          },{
            "title": "Silver Package",
            "subtitle": "Normal, 6 to 9 people, 50,000Ks per hour + 3 water bottles + chips",
            "image_url":"https://www.yangonbookings.com/timthumb/timthumb.php?src=https://www.yangonbookings.com/assets/uploads/listing/4b61466b91825f579bb3a2645fd7e89f.jpg&h=430&w=860",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve Now",                 
                  "payload": "packages: silver",
                }              
              ],
          },{
            "title": "Gold Package",
            "subtitle": "Big, 10 to 12 people, 70,000Ks per hour + 4 water bottles + fruit + chips",
            "image_url":"https://www.straitstimes.com/sites/default/files/articles/2020/08/16/hzjewel0815.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve Now",                 
                  "payload": "packages: gold",
                }              
              ],
          },{
            "title": "Platinum (VIP) Package",
            "subtitle": "Big, 15 to 20 people, 150,000Ks per hour + 6 water bottles + fruit + 6 beer + chips",
            "image_url":"https://i.pinimg.com/originals/a8/8c/aa/a88caa1cfdad9145ba7c8cd615bdd85b.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve Now",                 
                  "payload": "packages: platinum",
                }              
              ],
          },{
            "title": "PentHouse (Luxury) Package with Private Dj & Private Bar ",
            "subtitle": "Big, 30 to 35 people, 450,000Ks per hour + 10 water bottles + 4 fruit + 12 beer",
            "image_url":"https://www.filepicker.io/api/file/Yib3edKSTGChtVmNcGH5/convert?cache=true&crop=0%2C113%2C1999%2C1000",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve Now",                 
                  "payload": "packages: penthouse",
                }              
              ],
          },{
            "title": "See our Giant Promotions.",
            "image_url":"https://www.musicboxmn.com/wp-content/uploads/2019/04/mbpromoflyer.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Promotion",                 
                  "payload": "offer", 
                },               
              ],
          }
        ]
      }
    }
  }
        callSend(sender_psid, response1).then(()=>{
        return callSend(sender_psid, response2)
      });
}


const showPromotion = (sender_psid) => {
    let response1 = {"text": "Explore what we offer the best."};
    let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Birthday Parties Giant Promotion.",
            "subtitle": "Your Age is Your Discount! Contact us for detail.",
            "image_url":"https://bq.sg/wp-content/uploads/2017/09/img08844261c9b31d7138a1773e7bb3d4b7.jpeg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve a lounge Now!",
                  "payload": "packages", 
                },               
              ],
          },{
            "title": "Silver Package Promotion.",
            "subtitle": "One hour free of karaoke for every 45,000Ks spend. Contact us for detail.",
            "image_url":"https://www.yangonbookings.com/timthumb/timthumb.php?src=https://www.yangonbookings.com/assets/uploads/listing/4b61466b91825f579bb3a2645fd7e89f.jpg&h=430&w=860",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve this lounge!",
                  "payload": "packages: silver", 
                },               
              ],
          },{
            "title": "Gold Package Promotion.",
            "subtitle": "One hour free of karaoke for every 65,000Ks spend. Contact us for detail.",
            "image_url":"https://www.straitstimes.com/sites/default/files/articles/2020/08/16/hzjewel0815.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve this lounge!",
                  "payload": "packages: gold", 
                },               
              ],
          },{
            "title": "Platinum (VIP) Package Promotion.",
            "subtitle": "One hour free of karaoke for every 120,000Ks spend. Contact us for detail.",
            "image_url":"https://i.pinimg.com/originals/a8/8c/aa/a88caa1cfdad9145ba7c8cd615bdd85b.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve this lounge!",
                  "payload": "packages: platinum", 
                },               
              ],
          },{
            "title": "PentHouse (Luxury) Package Promotion.",
            "subtitle": "One hour free of karaoke for every 300,000Ks spend. Contact us for detail.",
            "image_url":"https://www.filepicker.io/api/file/Yib3edKSTGChtVmNcGH5/convert?cache=true&crop=0%2C113%2C1999%2C1000",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve this lounge!",
                  "payload": "packages: penthouse" 
                },               
              ],
          },{
            "title": "Day Promotion.",
            "subtitle": "Buy two Get four by visting 12:00pm to 6:00pm for Bronze, Silver and Gold Packages.",
            "image_url":"https://scontent.fymy1-2.fna.fbcdn.net/v/t1.0-9/p720x720/83896901_1077293602618371_3109857227712757760_o.jpg?_nc_cat=103&_nc_sid=110474&_nc_ohc=ImfV61uCMfoAX_ayJWb&_nc_ht=scontent.fymy1-2.fna&tp=6&oh=05c6b6a2930e7836a018e17bb6d240a9&oe=5FA5481B",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve a lounge Now!",
                  "payload": "packages", 
                },               
              ],
          },{
            "title": "Many Exciting Lounge Packages to Pick ",
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                  "payload": "packages", 
                },               
              ],
          },
        ]
      }
    }
  }
  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);  
  });  
}
const botQuestions = (current_question, sender_psid) => {
  if(current_question == 'q1'){
    let response = {"text": bot_questions.q1};
    callSend(sender_psid, response);
  }else if(current_question == 'q2'){
    let response = {"text": bot_questions.q2};
    callSend(sender_psid, response);
  }else if(current_question == 'q3'){
    let response = {"text": bot_questions.q3};
    callSend(sender_psid, response);
  }else if(current_question == 'q4'){
    let response = {"text": bot_questions.q4};
    callSend(sender_psid, response);
  }else if(current_question == 'q5'){
    let response = {"text": bot_questions.q5};
    callSend(sender_psid, response);
  }else if(current_question == 'q6'){
    let response = {"text": bot_questions.q6};
    callSend(sender_psid, response);
  }else if(current_question == 'q7'){
    let response = {"text": bot_questions.q7};
    callSend(sender_psid, response);
  }else if(current_question == 'q8'){
    let response = {"text": bot_questions.q8};
    callSend(sender_psid, response);
  }  
}

const confirmReservation = (sender_psid) => {
  console.log('RESERVATION INFO', userInputs);
  let summery = "packages:" + userInputs[user_id].package + "\u000A";
  summery += "date:" + userInputs[user_id].date + "\u000A";
  summery += "time:" + userInputs[user_id].time + "\u000A";
  summery += "sections:" + userInputs[user_id].sections + "\u000A";
  summery += "name:" + userInputs[user_id].name + "\u000A";
  summery += "phone:" + userInputs[user_id].phone + "\u000A";
  summery += "message:" + userInputs[user_id].message + "\u000A";

  let response1 = {"text": summery};
  let response2 = {
    "text": "Is this information correct? Tap Confirm to complete reservation.",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Confirm",
              "payload":"confirm-reservation",              
            },{
              "content_type":"text",
              "title":"Cancel",
              "payload":"off2",             
            }
    ]
  };
  
  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
}



const saveReservation = (arg, sender_psid) => {
  let data = arg;
  data.ref = generateRandom(6);
  data.status = "pending";
  data.created_on = new Date();
  db.collection('Reservations').add(data).then((success)=>{
    console.log('SAVED', success);
    let text = "Thank you. We have received your reservation."+ "\u000A";
    text += "Please show the REFERENCE CODE at the reception."+ "\u000A";
    text += "We wil call you to confirm soon. You can also track your reservation."+ "\u000A";
    text += "CONTACT US if you want to CANCEL your reservation."+ "\u000A";
    text += "Your reservation reference code is:" + data.ref; 
    let response1 = {"text": text}; 
    let response2 = {"text": "Would you like to preorder food and drink?",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Yes please.",
              "payload":"preorder",              
            },{
              "content_type":"text",
              "title":"No thanks.",
              "payload":"thankyou",             
            }
    ]
  };
    callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
    
  }).catch((err)=>{
     console.log('Error', err);
  });
}

const confirmRequest = (sender_psid) => {
  console.log('REQUEST SONGS', userInputs);
  let summery = "" + userInputs[user_id].reqsong + "\u000A";
  let response1 = {"text": summery};
  let response2 = {
    "text": "Is this the song you requested? Tap Yes to Confirm.",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Yes",
              "payload":"confirm-request",              
            },{
              "content_type":"text",
              "title":"No",
              "payload":"off1",             
            }
    ]
  };
  
  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
}

const saveRequest = (arg, sender_psid) => {
  let data = arg;
  data.status = "pending";
  data.created_on = new Date();
  db.collection('Song Requests').add(data).then((success)=>{
    console.log('SAVED', success);
    let text = "Thank you for requesting. Your song will be added soon. Would you like to see lounge packages?"+ "\u000A";
    let response1 = {"text": text};
    let response2 = {"attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Many Exciting Lounge Packages to Pick.",
              
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                 
                  "payload": "packages", 
                },               
              ],
          }
        ]
      }
    }
  }
      
    callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
    
  }).catch((err)=>{
     console.log('Error', err);
  });
}

const showReservations = async(sender_psid, reservation_ref) => {

    const reservationsRef = db.collection('Reservations').where("ref", "==", reservation_ref).limit(1);
    const snapshot = await reservationsRef.get();

    if (snapshot.empty) {
      let response = { "text": "Incorrect reference code. Please try again." };
      callSend(sender_psid, response).then(()=>{
        return botQuestions(sender_psid);
      });
    }else{
          let reservation = {}

          snapshot.forEach(doc => {      
              reservation.ref = doc.data().ref;
              reservation.status = doc.data().status;
              reservation.package = doc.data().package;
              reservation.date = doc.data().date;
              reservation.time = doc.data().time;
              reservation.sections = doc.data().sections;
              reservation.comment = doc.data().comment;  
          });


          let response1 = { "text": `Your Reservation ${reservation.ref} is ${reservation.status}.` };
          let response2 = { "text": `Your reserved package: ${reservation.package}.` };
          let response3 = { "text": `Your reserved date: ${reservation.date}.` };
          let response4 = { "text": `Your reserved time: ${reservation.time}.` };
          let response5 = { "text": `Your reserved sections: ${reservation.sections}.` };
          let response6 = { "text": `Admin's Comment: ${reservation.comment}.` };
            callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2).then(()=>{;
    return callSend(sender_psid, response3).then(()=>{;
    return callSend(sender_psid, response4).then(()=>{;
    return callSend(sender_psid, response5).then(()=>{;
    return callSend(sender_psid, response6);  
  });
  });
  });
  });
  });  
}
}

const showQuickReplyOff1 =(sender_psid) => {
  let response1 = { "text": "Request canceled" };
  let response2 = { "text": "Explore the best lounge packages we offer." };
  let response3 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Many Exciting Lounge Packages to Pick.", 
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                 
                  "payload": "packages", 
                },               
              ],
          }
        ]
      }
    }
  }
        callSend(sender_psid, response1).then(()=>{;
        return callSend(sender_psid, response2).then(()=>{;
        return callSend(sender_psid, response3);  
        });
      });
} 

const showQuickReplyOff2 =(sender_psid) => {
  let response1 = { "text": "Reservation canceled" };
  let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Show MusicBox KTV & Bar information. ",
            "image_url":"https://www.gomyanmartours.com/wp-content/uploads/2018/12/Music-Box-Karaoke-In-Yangon-3.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Basic Info",
                  "payload": "info",
                },               
              ],
          },{
            "title": "See our Giant Promotions.", 
            "image_url":"https://www.musicboxmn.com/wp-content/uploads/2019/04/mbpromoflyer.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Promotion",
                  "payload": "offer", 
                },               
              ],
          },{
            "title": "See Song List and Request.",
            "image_url":"https://cdn4.iconfinder.com/data/icons/jetflat-2-devices-vol-4/60/0093_036_album_music_media_song_songs-512.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Song List",
                  "payload": "list", 
                },               
              ],
          },{
            "title": "Many Exciting Lounge Packages to Pick. ",
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                  "payload": "packages", 
                },               
              ],
          },{
            "title": "Track my reservations.",
            "subtitle": "Show reservation info you have made.",
            "image_url":"https://static.vecteezy.com/system/resources/thumbnails/000/627/453/small/illust58-5815-01.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Track Reservation",
                  "payload": "track", 
                },               
              ],
          },
          ]
        }
      }
    }
        callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
} 

const showThanks =(sender_psid) => {
  let response = {"text": "Thank you for reservation. Please enjoy singing with us."};
  callSend(sender_psid, response);
}


const showMenu =(sender_psid) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "MENU",
            "image_url":"data:image/jpeg;base64,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",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "Preoder Now.",
                "url":APP_URL+"shop/",
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }  
  callSend(sender_psid, response);
}

/**************
end KTV
**************/

/*    table.addEventListener("input", function(e) {
        const tr = e.target.closest("tr");
        const idInput = tr.cells[colNo].querySelector("input");
        for (const input of tr.querySelectorAll("input")) {
            hasData = input.value.trim() !== "" && input !== idInput;
            if (hasData) break;
        }
        if (hasData && idInput.value.trim() === "") {
            idInput.value = (Math.max(...Array.from(
                table.querySelectorAll("td:nth-child(" + (colNo+1) + ") input"), 
                input => +input.value
            ).filter(v => !isNaN(v))) || 0) + 1;
        } else if (!hasData && idInput.value.trim() !== "") {
            idInput.value = "";
        }
    });
}
*/



const greetInMyanmar =(sender_psid) => {
  let response = {"text": "Mingalarbar. How may I help"};
  callSend(sender_psid, response);
}

const textReply =(sender_psid) => {
  let response = {"text": "You sent text message"};
  callSend(sender_psid, response);
}


const quickReply =(sender_psid) => {
  let response = {
    "text": "Select your reply",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"On",
              "payload":"on",              
            },{
              "content_type":"text",
              "title":"Off",
              "payload":"off",             
            }
    ]
  };
  callSend(sender_psid, response);
}

const showQuickReplyOn =(sender_psid) => {
  let response = { "text": "You sent quick reply ON" };
  callSend(sender_psid, response);
}


  
const buttonReply =(sender_psid) => {

  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Are you OK?",
            "image_url":"https://www.mindrops.com/images/nodejs-image.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }

  
  callSend(sender_psid, response);
}

const showButtonReplyYes =(sender_psid) => {
  let response = { "text": "You clicked YES" };
  callSend(sender_psid, response);
}

const showButtonReplyNo =(sender_psid) => {
  let response = { "text": "You clicked NO" };
  callSend(sender_psid, response);
}

const thankyouReply =(sender_psid, name, img_url) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Thank you! " + name,
            "image_url":img_url,                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }
  callSend(sender_psid, response);
}

function testDelete(sender_psid){
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Delete Button Test",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "enter",
                "url":"https://fbstarter.herokuapp.com/test/",
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}

const defaultReply = (sender_psid) => {
  let response = hiReply(sender_psid);
 callSend(sender_psid, response)
}


const callSendAPI = (sender_psid, response) => {   
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }
  
  return new Promise(resolve => {
    request({
      "uri": "https://graph.facebook.com/v6.0/me/messages",
      "qs": { "access_token": PAGE_ACCESS_TOKEN },
      "method": "POST",
      "json": request_body
    }, (err, res, body) => {
      if (!err) {
        //console.log('RES', res);
        console.log('BODY', body);
        resolve('message sent!')
      } else {
        console.error("Unable to send message:" + err);
      }
    }); 
  });
}

async function callSend(sender_psid, response){
  let send = await callSendAPI(sender_psid, response);
  return 1;
}


const uploadImageToStorage = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject('No image file');
    }
    let newFileName = `${Date.now()}_${file.originalname}`;
 
    let fileUpload = bucket.file(newFileName);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
         metadata: {
            firebaseStorageDownloadTokens: uuidv4
          }
      }
    });

    blobStream.on('error', (error) => {
      console.log('BLOB:', error);
      reject('Something is wrong! Unable to upload at the moment.');
    });

    blobStream.on('finish', () => {
      // The public URL can be used to directly access the file via HTTP.
      //const url = format(`https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`);
      const url = format(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${fileUpload.name}?alt=media&token=${uuidv4}`);
      console.log("image url:", url);
      resolve(url);
    });

    blobStream.end(file.buffer);
  });
}




/*************************************
FUNCTION TO SET UP GET STARTED BUTTON
**************************************/

const setupGetStartedButton = (res) => {
  let messageData = {"get_started":{"payload":"get_started"}};

  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
    },
    function (error, response, body) {
      if (!error && response.statusCode == 200) {        
        res.send(body);
      } else { 
        // TODO: Handle errors
        res.send(body);
      }
  });
} 

/**********************************
FUNCTION TO SET UP PERSISTENT MENU
***********************************/



const setupPersistentMenu = (res) => {
  var messageData = { 
      "persistent_menu":[
          {
            "locale":"default",
            "composer_input_disabled":false,
            "call_to_actions":[
                {
                  "type":"postback",
                  "title":"View My Tasks",
                  "payload":"view-tasks"
                },
                {
                  "type":"postback",
                  "title":"Add New Task",
                  "payload":"add-task"
                },
                {
                  "type":"postback",
                  "title":"Cancel",
                  "payload":"cancel"
                }
          ]
      },
      {
        "locale":"default",
        "composer_input_disabled":false
      }
    ]          
  };
        
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {
          res.send(body);
      } else { 
          res.send(body);
      }
  });
} 

/***********************
FUNCTION TO REMOVE MENU
************************/

const removePersistentMenu = (res) => {
  var messageData = {
          "fields": [
             "persistent_menu" ,
             "get_started"                 
          ]               
  };  
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'DELETE',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {          
          res.send(body);
      } else {           
          res.send(body);
      }
  });
} 


/***********************************
FUNCTION TO ADD WHITELIST DOMAIN
************************************/

const whitelistDomains = (res) => {
  var messageData = {
          "whitelisted_domains": [
             APP_URL , 
             "https://herokuapp.com" ,                                   
          ]               
  };  
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {          
          res.send(body);
      } else {           
          res.send(body);
      }
  });
} 