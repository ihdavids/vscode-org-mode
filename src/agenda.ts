
import * as vscode from 'vscode';
import * as path from 'path';
import {ODb} from "./db"
import {OrgExtension} from "./extension"
//import { Script } from 'vm';

class hnode {
  name: string;
  attribs: Record<string, string> = {}
  style: Record<string, string> = {};
  children: Array<hnode> = [];
  innerHTML: string = null;
  innerText: string = null;

  public constructor(nm: string) {
    this.name = nm;
  }

  findById(id): hnode {
    if (this.attribs.id === id) {
      return this;
    }
    for (var n of this.children) {
      var x = n.findById(id);
      if (x) {
        return x;
      }
    }
    return null;
  }

  prepend(n) {
    this.children.unshift(n);
  }

  append(n) {
    this.children.push(n);
  }

  // alias for web compatibility
  appendChild(n) {
    this.append(n);
  }

  getChildren(): string {
    let rv = "";
    if (this.children.length > 0) {
      for(var node of this.children) {
        rv += node.render();
      }
      return rv;
    }
    if (this.innerHTML) {
      return this.innerHTML;
    }
    if (this.innerText) {
      return this.innerText;
    }
    return "";
  }

  set className(val: string) {
    this.attribs['class'] = val;
  }
  set id(val: string) {
    this.attribs['id'] = val;
  }

  getAttributes(): string {
    let rv: string = "";
    for (const [key, val] of Object.entries(this.attribs)) {
      rv += ` ${key}='${val}'`
    }
    return rv;
  }

  getStyle(): string {
    let rv: string = "";
    if (Object.keys(this.style).length > 0) {
      rv = " style='";
        for (const [key, val] of Object.entries(this.style)) {
          rv += `${key}:${val};`
        }
      rv += "'";
    }
    return rv;
  }

  render(): string {
    return `<${this.name}${this.getAttributes()}${this.getStyle()}>${this.getChildren()}</${this.name}>`;
  }
}

function toTimeStr(hrs: number): string {
  let lmins = (hrs % 1 * 60)
  let rstr = `${Math.floor(hrs)}`
  if (lmins > 0) {
    rstr = `${rstr}:${String(lmins).padStart(2,'0')}`
  }
  return rstr;
}

function createEvent(evt, height, top, left, units): hnode {
  let node: hnode = new hnode('div');
  let timeStart = getInMinutes(evt.Date.Start)/60 + startHour;
  let timeEnd   = getInMinutes(evt.Date.End)/60 + startHour;
  if (timeEnd <= timeStart) {
    timeEnd = timeStart + .5;
  }

  let timeStr = `${toTimeStr(timeStart)} - ${toTimeStr(timeEnd)}`
  let filename = evt.Filename.replaceAll("\\","/");
  console.log(filename);
  let linenum  = evt.LineNum;
  node.className = "agd-event";
  node.attribs['onclick'] = `itemClicked(\"${filename}\",${linenum})`;
  // border-left-color: #57b986;
  if (evt.Headline.length > 40) {
    node.innerHTML = `<span class='agd-title' style='font-size:95%;'>${evt.Headline}</span><br><span class='agd-location'> ${timeStr} </span>`;
  } else {
    node.innerHTML = `<span class='agd-title'>${evt.Headline}</span><br><span class='agd-location'> ${timeStr} </span>`;
  }

  // Customized CSS to position each event
  node.style.width = (containerWidth/units) + "px";
  node.style.height = height + "px";
  node.style.top = top + "px";
  node.style.left = 100 + left + "px";

  //node.style['border-left-color'] = '#f00';
  return node;
}

let containerHeight = 720;
let containerWidth = 600;
let collisions = [];
let width = [];
let leftOffSet = [];
let startHour = 9
let endHour   = 21
let minutesinDay = 60* (endHour - startHour)
let timeFormat = 12

function clamp(x) {
  if (x < 0) {
    return 0;
  }
  return x
}

var currentDay = new Date();


function getInMinutes(d) {
  let startMinutes = startHour * 60;
  if (d) {
    if (typeof d === 'string') {
      if (d === "0001-01-01T00:00:00Z") {
        return 0;
      }
      d = new Date(d);
    }
    let stime = (d.getHours() * 60 + d.getMinutes()) - startMinutes;
    return stime;
  } else {
    return 0;
  }
}

function getCollisions (events) {

  //resets storage
  collisions = [];
  if (events == null) {
    return;
  }
  // 26 because end + 60 + extra hour to be safe
  for (var i = 0; i <= 26; i ++) {
    var time = [];
    for (var j = 0; j < events.length; j++) {
      time.push(0);
    }
    collisions.push(time);
  }

  let didClamp = false;
  events.forEach((event, id) => {
    let end = getInMinutes(event.Date.End);
    let start = getInMinutes(event.Date.Start);
    if (end == 0) {
      end = start + 60;
    }
    // out of range
    if (start < 0) {
      start = 0;
    }
    let order = 1;
    let cur = start;
    while (cur <= end) {
      var timeIndex = Math.floor(cur/30);
      if (timeIndex < 0) {
        cur = cur + 30;
        continue;
      }
      while (order < events.length) {
        if (timeIndex < collisions.length && collisions[timeIndex].indexOf(order) === -1) {
          break;
        }
        order ++;
      }
      cur += 30;
    }

    cur = start;
    while (cur <= end) {
      var timeIndex = Math.floor(cur/30);
      if (timeIndex < 0) {
        cur = cur + 30;
        continue;
      }
      collisions[timeIndex][id] = order;
      cur += 30;
    }

    //collisions[Math.floor((end-1)/30)][id] = order;
  });
};

/*
find width and horizontal position

width - number of units to divide container width by
horizontal position - pixel offset from left
*/
function getAttributes (events) {

  //resets storage
  width = [];
  leftOffSet = [];

  if (events == null) {
    return;
  }

  for (var i = 0; i < events.length; i++) {
    width.push(0);
    leftOffSet.push(0);
  }
  // collisions has a [timeframe][eventid] list 
  collisions.forEach((period) => {

    // number of events in that period
    let count = period.reduce((a,b) => {
      return b ? a + 1 : a;
    })

    if (count > 1) {

      period.forEach((event, id) => {
        // max number of events it is sharing a time period with determines width
        if (period[id]) {
          if (count > width[id]) {
            width[id] = count;
          }
        }

        if (period[id] && !leftOffSet[id]) {
          leftOffSet[id] = period[id];
        }
      })
    }
  });
};


function createTimeBlocks() {
  let agd = new hnode('div');
  agd.id = 'agenda';
  agd.className = "agd-container"
  var timings = new hnode('div');
  timings.className = "agd-timings";
  agd.prepend(timings);
  
  var days = new hnode('div');
  days.className = "agd-days";
  days.id = "events";

  agd.append(days);

  timings.innerHTML = '';
  for (let i = startHour; i <= endHour; ++i) {

    let node = new hnode('div');
    let out = i
    if (timeFormat == 12) {
      var suffix = " AM"
      if (i >= 12) {
        suffix = " PM"
      }
      if (i > 12) {
        out = i - 12
      }
      node.innerHTML = `<span>${out}:00</span>${suffix}` 
    } else {
      suffix = " Hrs"
      node.innerHTML = `<span>${out}:00</span>${suffix}`
    }
    timings.append(node);

    if (i != endHour) {
      node = new hnode('div');

      let out = i
      if (timeFormat == 12) {
        if (i > 12) {
          out = i - 12
        }
        node.innerHTML = `${out}:30` 
      } else {
        node.innerHTML = `${out}:30`
      }
      timings.append(node);
    }
  }
  return agd;
}

function createTimeMarker (events: hnode, height, top, left, units, out_of_day) {
  let node = new hnode('div'); 
  let dot  = new hnode('div');
  if (!out_of_day) {
    dot.className  = "agd-dot"
    node.className = "agd-timeMarker";
  } else {
    dot.className  = "agd-dot-oob"
    node.className = "agd-timeMarker-oob";
  }

  // Customized CSS to position each event
  node.style.width  = (containerWidth/units) + "px";
  node.style.height = height + "px";
  node.style.top    = top + "px";
  node.style.left   = left + "px";

  let r = height*4;
  dot.style.width  = r + "px";
  dot.style.height = r + "px";
  dot.style.top    = top - (r/2) + (height/2) + "px";
  dot.style.left   = clamp(left - r/2) + "px";

  events.appendChild(dot);
  events.appendChild(node);
}



function getWebviewContent(webview, title: string, agd) {
    console.log(agd);
    //const myStyle = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'my-custom-style.css'));
    const coreStyle = webview.asWebviewUri(vscode.Uri.file(path.join(OrgExtension.get().context.extensionPath, 'media', 'day_agenda.css')));
    const dayStyle  = webview.asWebviewUri(vscode.Uri.file(path.join(OrgExtension.get().context.extensionPath, 'media', 'base_css.css')));
    console.log(coreStyle);
    let agendaItems: string = "";
    let id = 0;
    getCollisions(agd);
    getAttributes(agd);
    let scr = new hnode('script');
    scr.innerText = `
        const vscode = acquireVsCodeApi(); 
        function itemClicked(jumpTo, lineNo){
            vscode.postMessage({command: "open", text: jumpTo, line: lineNo});
        }`;
    let scrStr = scr.render();
    var time = createTimeBlocks();
    var evts = time.findById('events');
    for (var item of agd) {
      let s = getInMinutes(item.Date.Start);
      let e = getInMinutes(item.Date.End);
      if (s < 0) {
        s = 0;
      }
      let height = (e - s) / minutesinDay * containerHeight;
      let top = s / minutesinDay * containerHeight; 
      let units = width[id];
      if (!units) {units = 1};
      let left = (containerWidth / width[id]) * (leftOffSet[id] - 1) + 10;
      if (!left || left < 0) {left = 10};
      if (top < containerHeight) {
        evts.append(createEvent(item,height,top,left,units));
      }
      id += 1;
    }
    const now   = new Date();
    let nowMins = getInMinutes(now);
    let height = 2;
    let top = nowMins / minutesinDay * containerHeight; 
    let units = 1;
    let left = 100; // this is the agd-timings style
    let out_of_day = false;
    if (top > containerHeight) {
      top = containerHeight+2;
      out_of_day = true;
    }
    createTimeMarker(evts,height, top, left, units, out_of_day);

    agendaItems = time.render();
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link href="${coreStyle}" rel="stylesheet" />  
    <link href="${dayStyle}" rel="stylesheet" />  
</head>
<body>
${scrStr}
<div id="content-wrapper" class="d-flex flex-column">
  <div id="content">
  <div class="container-fluid" id="agenda_section">
    <br>
    <div class="d-sm-flex align-items-center justify-content-between mb-4">
        <h1 id="agendaTitle" class="h3 mb-0 text-gray-800">Agenda</h1>
    </div>
    <div class="row">
    ${agendaItems}
    </div>
  </div>
  </div>
</div>
</body>
</html>`;
}


export async function showAgenda(doc: vscode.TextEditor) {

      const panel = vscode.window.createWebviewPanel(
        'agenda',
        'Agenda',
        vscode.ViewColumn.One,
        {enableScripts: true}
      );

      let iteration = 0;
      const updateWebview = async () => {
        let agd = await ODb.agenda();
        panel.title = 'Agenda';
        panel.webview.html = getWebviewContent(panel.webview, 'Agenda', agd);
      };

      // Set initial content
      updateWebview();
    // handle recieving messages from the webview
    panel.webview.onDidReceiveMessage(message => {
      switch(message.command) {
        case 'open': vscode.window.showErrorMessage(message.text);
            var openPath = vscode.Uri.file(message.text);
            console.log(openPath);
            vscode.workspace.openTextDocument(openPath).then(textDoc => {
                vscode.window.showTextDocument(textDoc).then( doc => {
                  let line = message.line;
                  doc.revealRange(new vscode.Range(new vscode.Position(line,0), new vscode.Position(line,0)));
                });
            });
        return;
      }
    }, undefined, undefined); 
  
      // And schedule updates to the content every second
      const interval = setInterval(updateWebview, 1000*30);

      panel.onDidDispose(
        () => {
          // When the panel is closed, cancel any future updates to the webview content
          clearInterval(interval);
        },
        null,
        OrgExtension.get().context.subscriptions
      );

    console.log("SHOW AGENDA SHOWN");
}