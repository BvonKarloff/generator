/* global Electricomic */

var express = require('express');
var multer = require('multer');
var app = express();
var http = require('http');
var path = require('path');
var fs = require('fs');
var bodyParser = require('body-parser');
var archiver = require('archiver');
var ncp = require('ncp').ncp;
var nwgui = require('nw.gui');

// server stuff
var server;
var sockets = {};
var nextSocketId = 0;

// create application/json parser
var jsonParser = bodyParser.json();
// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: true });

// debug
nwgui.Window.get().showDevTools();

var options = {
  host: '0.0.0.0',
  port: 8000
};
var serverUrl = 'http://' + options.host + ':' + options.port;

// project = { id, fsPath, serverPath, name }
var projects = {};
var projectsCounter = 0;
var projectExt = '.elcxproject';
var projectExtReg = new RegExp(projectExt + '$', 'i');
var iframesOpen = 0;
var currentProject;

var red = function() {
  if (typeof window === 'undefined') {
    return false;
  }
  if ($iframe.attr('src').indexOf(serverUrl) < 1) { 
    $iframe.attr('src', serverUrl + '/loading.html');
  }
};


var createZip = function(mypath) {
  console.log('zip');
  var outputPath = mypath + '-electricomic.zip';
  var srcDirectory = mypath;
  var output = fs.createWriteStream(outputPath);
  var zipArchive = archiver('zip');
  output.on('close', function() {
    console.log('done with the zip', outputPath);
  });
  zipArchive.pipe(output);
  zipArchive.bulk([
    { src: [ '**/*' ], cwd: srcDirectory, expand: true }
  ]);
  zipArchive.finalize(function(err, bytes) {
    if (err) {
      throw err;
    }
    console.log('done: ', bytes);
  });
};


var iframeFrill = function() {
  if (iframesOpen <= 0) {
    $menuItemProject.addClass('menu-item-disabled');
  }
  else {
    $menuItemProject.removeClass('menu-item-disabled');
  }
};

var iframeAdd = function(id) {
  var $newIframe = $('<iframe class="iframe" src="' + serverUrl + '/loading.html?id=' + id + '&path=' + projects[id].serverPath + '" frameborder="0" id="iframe-' + id + '"></iframe>');
  var $newTab = $('<span class="tab" id="tab-' + id + '">' + projects[id].name + '</span>');
  $iframes.append($newIframe);
  $tabs.append($newTab);
  iframes[id] = $newIframe;
  tabs[id] = $newTab;
  iframeSelect(id);
  iframesOpen++;
  iframeFrill();
};

var iframeClose = function(id) {
  var prevIframe = tabs[id].prev();
  if (prevIframe.length > 0) {
    iframeSelect(prevIframe);
  }
  iframes[id].remove();
  tabs[id].remove();
  delete iframes[id];
  delete tabs[id];
  iframesOpen--;
  iframeFrill();
};

var iframeSelect = function(id) {
  currentProject = id;
  $('.iframe-selected').removeClass('iframe-selected');
  iframes[id].addClass('iframe-selected');
  $('.tab-selected').removeClass('tab-selected');
  tabs[id].addClass('tab-selected');
};


// configure multer
var multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/Users/electric_g/multer');
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now());
  }
});
var multerUpload = multer({
  storage: multerStorage,
  limits: {
    fieldSize: 100000000
  },
  rename: function (fieldname, filename) {
    return filename;
  },
  onFileUploadStart: function (file) {
    // console.log(file.originalname + ' is starting ...');
  },
  onFileUploadComplete: function (file) {
    // console.log(file.fieldname + ' uploaded to  ' + file.path);
  }
});


// var writeJSON = function(file, content) {
//   fs.writeFile(projectPath + '/' + file, JSON.stringify(content, null, 2));
// };


var serverStart = function() {
  //check if server is already running
  http.get(options, function(res) {
    console.log('server is already running');
  }).on('error', function(e) {
    //server is not yet running

    // all environments
    app.set('port', options.port);
    app.use(express.static(path.join(process.cwd(), 'public')));
    // app.use('/comic', express.static(mypath));

    // todo
    app.post('/upload', multerUpload.array(), function(req, res) {
      // to finish
      var txt = JSON.stringify(req.files);
      txt = JSON.parse(txt);
      if (txt.panelAdd) {
        if (Array.isArray(txt.panelAdd)) {
          for (var i = 0; i < txt.panelAdd.length; i++) {
            txt.panelAdd[i].path = txt.panelAdd[i].path.replace(mypath + '/', '');
          }
        }
        else {
          txt.panelAdd.path = txt.panelAdd.path.replace(mypath + '/', '');
        }
      }
      txt = JSON.stringify(txt);
      res.end('{"status": "ok", "form": ' + txt + '}');
    });

    server = http.createServer(app);
    server.listen(options.port, function(err) {
      console.log('server created');
      projectOpenAll();
    });

    server.on('connection', function (socket) {
      // Add a newly connected socket
      var socketId = nextSocketId++;
      sockets[socketId] = socket;
      console.log('socket', socketId, 'opened');

      // Remove the socket when it closes
      socket.on('close', function () {
        console.log('socket', socketId, 'closed');
        delete sockets[socketId];
      });
    });
  });
};

// not sure I need this
var serverStop = function() {
  if (server) {
    server.close(function() {
      console.log('closed');
    });
    for (var socketId in sockets) {
      console.log('socket', socketId, 'destroyed');
      sockets[socketId].destroy();
    }
  }
};


var projectOpen = function(path, name) {
  if (!path) {
    return false;
  }
  for (var p in projects) {
    if (projects.hasOwnProperty(p)) {
      // check if this filesystem path aka the project has been already opened
      if (projects[p].fsPath === path) {
        return false;
      }
    }
  }
  projectsCounter++;
  var nameNoExt = name.replace(projectExtReg, '');
  var id = projectsCounter + '-' + nameNoExt;
  projects[id] = {
    name: nameNoExt,
    fsPath: path,
    serverPath: '/' + id
  };
  // mount folder
  app.use('/' + id, express.static(path));
  // save that we opened this project
  localStorage.setItem('projects', JSON.stringify(projects));
  // load iframe
  iframeAdd(id);
};

var projectOpenAll = function() {
  try {
    var proj = JSON.parse(localStorage.getItem('projects'));
  }
  catch (e) {
    return false;
  }
  for (var p in proj) {
    if (proj.hasOwnProperty(p)) {
      projectOpen(proj[p].fsPath, proj[p].name);
    }
  }
};

var projectStartSave = function(id) {
  var projectId = id || currentProject;
  iframes[projectId].get(0).contentWindow.postMessage('{"type": "save", "iframe": "' + projectId + '"}', serverUrl);
};

var projectSave = function(content, id) {
  var projectId = id || currentProject;
  iframes[projectId].get(0).contentWindow.postMessage('{"type": "saved", "iframe": "' + projectId + '"}', serverUrl);
};

var projectNew = function(newPath, name) {
  // create package.json if it doesn't exist
  // fs.exists(mypath + '/project.json', function(exists) {
  //   if (!exists) {
  //     var emptyComic = new Electricomic(null);
  //     writeJSON('project.json', emptyComic.returnJSON());
  //   }
  // });

  // create folder and files
  var source = path.join(process.cwd(), 'comic');
  ncp(source, newPath, function (err) {
    if (err) {
      console.log(err);
      return;
    }
    console.log('copy done');
  });
  
  projectOpen(newPath, name);
};

var projectClose = function(id) {
  var projectId = id || currentProject;
  projectSave(currentProject);
  iframeClose(currentProject);
  // unmount folder
};

// var startProject = function(mypath) {
//   if (!mypath) {
//     console.log('server not started, invalid path');
//     return false;
//   }
//   //check if server is already running
//   http.get(options, function(res) {
//     console.log('server is running, redirecting to localhost');
//     red();
//   }).on('error', function(e) {
//     //server is not yet running

//     // configure multer
//     app.use(multer({ dest: mypath + '/images',
//       limits: {
//         fieldSize: 100000000
//       },
//       rename: function (fieldname, filename) {
//         return filename;
//       },
//       onFileUploadStart: function (file) {
//         // console.log(file.originalname + ' is starting ...');
//       },
//       onFileUploadComplete: function (file) {
//         // console.log(file.fieldname + ' uploaded to  ' + file.path);
//         done = true;
//       }
//     }));

//     // create package.json if it doesn't exist
//     fs.exists(mypath + '/project.json', function(exists) {
//       if (!exists) {
//         var emptyComic = new Electricomic(null);
//         writeJSON('project.json', emptyComic.returnJSON());
//       }
//     });

//     // all environments
//     app.set('port', options.port);
//     app.use(express.static(path.join(process.cwd(), 'public')));
//     app.use('/comic', express.static(mypath));

//     app.post('/upload',function(req, res){
//       if (done === true){
//         var txt = JSON.stringify(req.files);
//         txt = JSON.parse(txt);
//         if (txt.panelAdd) {
//           if (Array.isArray(txt.panelAdd)) {
//             for (var i = 0; i < txt.panelAdd.length; i++) {
//               txt.panelAdd[i].path = txt.panelAdd[i].path.replace(mypath + '/', '');
//             }
//           }
//           else {
//             txt.panelAdd.path = txt.panelAdd.path.replace(mypath + '/', '');
//           }
//         }
//         txt = JSON.stringify(txt);
//         res.end('{"status": "ok", "form": ' + txt + '}');
//       }
//     });

//     server = http.createServer(app);
//     server.listen(options.port, function(err) {
//       console.log('server created');
//       red();
//     });

//     server.on('connection', function (socket) {
//       // Add a newly connected socket
//       var socketId = nextSocketId++;
//       sockets[socketId] = socket;
//       console.log('socket', socketId, 'opened');

//       // Remove the socket when it closes
//       socket.on('close', function () {
//         console.log('socket', socketId, 'closed');
//         delete sockets[socketId];
//       });
//     });
//   });
// };


// UI
var $iframe = $('#creator-tool');
var $newProject = $('#new-project');
var $openProject = $('#open-project');
var $saveProject = $('#save-project');
var $closeProject = $('#close-project');
var $comicPreview = $('#comic-preview');
var $comicFolder = $('#comic-folder');
var $comicExport = $('#comic-export');
var $quit = $('#quit');
var $iframes = $('#iframes');
var iframes = {};
var $tabs = $('#tabs');
var tabs = {};
var $menuItemProject = $('.menu-item-project');


$quit.on('click', function() {
  if (confirm('Are you sure you want to quit the app?')) {
    nwgui.App.quit();
  }
});

$newProject.on('change', function() {
  var path = this.files[0].path;
  var name = this.files[0].name;
  console.log(path, name);
  if (path !== '') {
    projectNew(path, name);
    this.value = '';
  }
});

$openProject.on('change', function() {
  var path = this.files[0].path;
  var name = this.files[0].name;
  console.log(path, name);
  if (path !== '') {
    projectOpen(path, name);
    this.value = '';
  }
});

$saveProject.on('click', function() {
  if ($(this).hasClass('menu-item-disabled')) {
    return;
  }
  projectStartSave();
});

$closeProject.on('click', function() {
  if ($(this).hasClass('menu-item-disabled')) {
    return;
  }
  // $iframe.get(0).contentWindow.postMessage('{"type": "close"}', serverUrl);
  projectClose();
});

$comicPreview.on('click', function() {
  if ($(this).hasClass('menu-item-disabled')) {
    return;
  }
  nwgui.Shell.openExternal(serverUrl + '/comic');
});

$comicFolder.on('click', function() {
  if ($(this).hasClass('menu-item-disabled')) {
    return;
  }
  nwgui.Shell.showItemInFolder(projects[currentProject].fsPath);
});

$comicExport.on('click', function() {
  if ($(this).hasClass('menu-item-disabled')) {
    return;
  }
  createZip(projects[currentProject].fsPath);
  nwgui.Shell.showItemInFolder(projects[currentProject].fsPath);
});

window.addEventListener('message', function(e) {
  if (e.origin !== serverUrl) {
    return false;
  }
  
  var msg;
  try {
    msg = JSON.parse(e.data);
  } catch(err) {
    console.log('error in the received post message');
    return false;
  }

  if (msg.type === 'save') {
    projectSave(msg.content, msg.iframe);
  }
  if (msg.type === 'close') {
    projectClose(msg.iframe);
  }
}, false);


serverStart();