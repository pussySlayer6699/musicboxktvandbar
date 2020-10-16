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
  "q1": "For which date do you want to reserve? (yyyy-mm-dd)",
  "q2": "Please enter time you want to sing.(hh:mm)",
  "q3": "Please enter your name",
  "q4": "please enter your phone number",
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

app.get('/admin/reservations', async function(req,res){
 
  const reservationsRef = db.collection('reservations');
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
  
  const appoinmentRef = db.collection('reservations').doc(doc_id);
  const doc = await appoinmentRef.get();
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
    status:req.body.status,
    doc_id:req.body.doc_id,
    ref:req.body.ref,
    comment:req.body.comment
  }

  db.collection('reservations').doc(req.body.doc_id)
  .update(data).then(()=>{
      res.redirect('/admin/reservations');
  }).catch((err)=>console.log('ERROR:', error)); 
 
});

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
        case "off":
            showQuickReplyOff(sender_psid);
          break; 
        case "confirm-reservation":
              saveReservation(userInputs[user_id], sender_psid);
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
     current_question = '';
     
     confirmReservation(sender_psid);
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
    console.log('SELECTED PACKAGE IS: ', package_name);
    userInputs[user_id].package = package_name;
    console.log('TEST', userInputs);
    botQuestions(sender_psid);
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
const hospitalAppointment = (sender_psid) => {
   let response1 = {"text": ""};
   let response2 = {
    "text": "Please select department",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"General Surgery",
              "payload":"department:General Surgery",              
            },{
              "content_type":"text",
              "title":"ENT",
              "payload":"department:ENT",             
            },{
              "content_type":"text",
              "title":"Dermatology",
              "payload":"department:Dermatology", 
            }

    ]
  };

  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
}


const showDoctor = (sender_psid) => {
    let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "James Smith",
            "subtitle": "General Surgeon",
            "image_url":"https://image.freepik.com/free-vector/doctor-icon-avatar-white_136162-58.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "James Smith",
                  "payload": "Doctor:James Smith",
                },               
              ],
          },{
            "title": "Kenneth Martinez",
            "subtitle": "General Surgeon",
            "image_url":"https://image.freepik.com/free-vector/doctor-icon-avatar-white_136162-58.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Kenneth Martinez",
                  "payload": "Doctor:Kenneth Martinez",
                },               
              ],
          },{
            "title": "Barbara Young",
            "subtitle": "General Surgeon",
            "image_url":"https://cdn.iconscout.com/icon/free/png-512/doctor-567-1118047.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Barbara Young",
                  "payload": "Doctor:Barbara Young",
                },               
              ],
          }

          ]
        }
      }
    }

  
  callSend(sender_psid, response);

}

const firstOrFollowUp = (sender_psid) => {

  let response = {
    "text": "First Time Visit or Follow Up",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"First Time",
              "payload":"visit:first time",              
            },{
              "content_type":"text",
              "title":"Follow Up",
              "payload":"visit:follow up",             
            }
    ]
  };
  callSend(sender_psid, response);

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
  }
}

const confirmReservation = (sender_psid) => {
  console.log('RESERVATION INFO', userInputs);
  let summery = "packages:" + userInputs[user_id].package + "\u000A";
  summery += "date:" + userInputs[user_id].date + "\u000A";
  summery += "time:" + userInputs[user_id].time + "\u000A";
  summery += "name:" + userInputs[user_id].name + "\u000A";
  summery += "phone:" + userInputs[user_id].phone + "\u000A";

  let response1 = {"text": summery};

  let response2 = {
    "text": "Select your reply",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Confirm",
              "payload":"confirm-reservation",              
            },{
              "content_type":"text",
              "title":"Cancel",
              "payload":"off",             
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
  db.collection('reservations').add(data).then((success)=>{
    console.log('SAVED', success);
    let text = "Thank you. We have received your reservation."+ "\u000A";
    text += " We wil call you to confirm soon"+ "\u000A";
    text += "Your reservation reference number is:" + data.ref;
    let response = {"text": text};
    callSend(sender_psid, response);
  }).catch((err)=>{
     console.log('Error', err);
  });
}

/**************
end hospital
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
            "title": "See Song List and Request ",
              
            "image_url":"https://cdn4.iconfinder.com/data/icons/jetflat-2-devices-vol-4/60/0093_036_album_music_media_song_songs-512.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Song List",
                  "payload": "list", 
                },               
              ],
          },

          {
            "title": "Many Exciting Lounge Packages to Pick ",
              
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                  "payload": "packages", 
                },               
              ],
          },{
            "title": "See what we offer ",
              
            "image_url":"https://www.musicboxmn.com/wp-content/uploads/2019/04/mbpromoflyer.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Promotion",
                  "payload": "offer", 
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
    let response1 = {"text": "Explore the best lounge packages we offer. "};
    let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Bronze Package",
            "subtitle": "small, 4 to 6 people, 15,000Ks per hour+ 2 water bottles ",
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
            "subtitle": "Normal, 6 to 9 people, 20,000Ks per hour + 3 water bottles + chips",
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
            "subtitle": "Big, 8 to 12 people, 45000Ks per hour + 4 water bottles + fruit + chips",
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
            "subtitle": "Big, 8 to 12 people, 75,000Ks per hour + 4 water bottles + fruit + 5 beer + chips",
            "image_url":"https://i.pinimg.com/originals/a8/8c/aa/a88caa1cfdad9145ba7c8cd615bdd85b.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve Now",                 
                  "payload": "packages: platinum",
                }              
              ],
          },{
            "title": "Diamond (Luxury) Package with Private Dj & Private Bar ",
            "subtitle": "Big, 10 to 15 people, 200,000Ks per hour + 5 water bottles + 2 fruit + 6 beer",
            "image_url":"https://www.filepicker.io/api/file/Yib3edKSTGChtVmNcGH5/convert?cache=true&crop=0%2C113%2C1999%2C1000",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Reserve Now",                 
                  "payload": "packages: diamond",
                }              
              ],
          },{
            "title": "See what we offer ",
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
    let response1 = {"text": "Birthday Promotion: 10% off for every packages"};
    let response2 = {"text": "Silver Room Promotion: One hour free of karaoke for every 25,000Ks spend."};
    let response3 = {"text": "Gold Room Promotion: One hour free of karaoke for every 50,000Ks spend."};
    let response4 = {"text": "Buy one Get one Promotion: Buy one Get one by visting us from 1:00pm to 4:00pm for Bronze, Silver and Gold Packages."};
    let response5 = {"text": "Contact us for more information."};
    let response6 = {"text": "Would you like to see lounge packages?"};
    let response7 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Many Exciting Lounge Packages to Pick ",
              
            "image_url":"https://static.thehoneycombers.com/wp-content/uploads/sites/2/2018/08/Ziggy-karaoke-in-singapore.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "See Lounge Packages",
                  "payload": "packages", 
                },               
              ],
          },{
            "title": "Show MusicBox KTV & Bar information. ",
            "image_url":"https://www.gomyanmartours.com/wp-content/uploads/2018/12/Music-Box-Karaoke-In-Yangon-3.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Basic Info",
                  "payload": "info",
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
    return callSend(sender_psid, response5).then(()=>{;
    return callSend(sender_psid, response6).then(()=>{;
    return callSend(sender_psid, response7);  
  });  
  });
  });
  });
  });
  });
}


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

const showQuickReplyOff =(sender_psid) => {
  let response = { "text": "You sent quick reply OFF" };
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