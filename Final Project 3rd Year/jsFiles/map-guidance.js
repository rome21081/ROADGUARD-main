'use strict';

window.MapGuidance = (() => {
  const safety = () => window.MapSafety;
  const instruction = step => {
    const m = step.maneuver || {}, modifier = String(m.modifier || '').replace(/-/g, ' ');
    const road = step.name || step.ref || '';
    const onto = road ? ' onto ' + road : '';
    const direction = modifier === 'uturn' ? 'a U-turn' : modifier || 'ahead';
    if(modifier==='uturn' && !['depart','arrive','roundabout','rotary'].includes(m.type))return 'Make a U-turn'+onto;
    switch (m.type) {
      case 'depart': return road ? 'Start on ' + road : 'Start along the route';
      case 'arrive': return 'Arrive at the route destination';
      case 'roundabout': case 'rotary': return 'Enter the roundabout' + (m.exit ? ' and take exit ' + m.exit : '') + onto;
      case 'exit roundabout': case 'exit rotary': return 'Exit the roundabout' + onto;
      case 'merge': return 'Merge ' + (modifier || 'ahead') + onto;
      case 'on ramp': return 'Take the ramp ' + (modifier || 'ahead') + onto;
      case 'off ramp': return 'Take the exit ' + (modifier || 'ahead') + onto;
      case 'fork': return 'Keep ' + (modifier || 'ahead') + onto;
      case 'end of road': return 'At the end of the road, turn ' + direction + onto;
      case 'continue': case 'new name': case 'notification': return (modifier && modifier !== 'straight' ? 'Continue ' + direction : 'Continue straight') + onto;
      default: return modifier === 'uturn' ? 'Make a U-turn' + onto : modifier === 'straight' ? 'Continue straight' + onto : 'Turn ' + direction + onto;
    }
  };
  const maneuverPath = step => {
    const maneuver = step?.maneuver || {}, modifier = maneuver.modifier || '';
    if (maneuver.type === 'depart') return 'M12 20V4m-6 6 6-6 6 6';
    if (maneuver.type === 'arrive') return 'M5 21V3m0 1h13l-3 4 3 4H5';
    if (maneuver.type === 'roundabout' || maneuver.type === 'rotary') return 'M7 19v-4a6 6 0 1 1 10-5m0-5v5h-5';
    if (modifier === 'uturn') return 'M7 20V8a5 5 0 0 1 10 0v8m-4-4 4 4 4-4';
    if (modifier.includes('left')) return 'M16 20v-8a5 5 0 0 0-5-5H4m5-5L4 7l5 5';
    if (modifier.includes('right')) return 'M8 20v-8a5 5 0 0 1 5-5h7m-5-5 5 5-5 5';
    return 'M12 20V4m-6 6 6-6 6 6';
  };
  const stepsFor = route => {
    const steps = [];
    let offset = 0;
    (route.legs || []).forEach((leg, legIndex, legs) => {
      (leg.steps || []).forEach(step => {
        const maneuver = step.maneuver || {};
        if (maneuver.type === 'arrive' && legIndex < legs.length - 1) return;
        const point = Array.isArray(maneuver.location) ? safety().coordinates({ latitude: maneuver.location[1], longitude: maneuver.location[0] }) : null;
        if (!point) return;
        const points = (step.geometry?.coordinates || []).map(p => safety().coordinates({latitude:p[1],longitude:p[0]})).filter(Boolean);
        if (!points.length) points.push(point);
        const length = points.slice(1).reduce((sum, p, i) => sum + safety().distance(points[i], p), 0);
        const item = { ...step, maneuver, point, points, start: offset, length, text: instruction(legIndex && maneuver.type === 'depart' ? {...step,maneuver:{...maneuver,type:'continue'}} : step) };
        steps.push(item);
        offset += length;
      });
    });
    return steps;
  };
  const projectProgress = (steps, position, previousAlong = null, displacement = 0) => {
    let best = null;
    for (const step of steps) {
      let local = 0;
      for (let i = 1; i < step.points.length; i++) {
        const a = step.points[i-1], b = step.points[i];
        const rad = n => n * Math.PI / 180;
        const x = rad(a[1]-position[1])*6371000*Math.cos(rad(position[0])), y = rad(a[0]-position[0])*6371000;
        const dx = rad(b[1]-a[1])*6371000*Math.cos(rad(position[0])), dy = rad(b[0]-a[0])*6371000;
        const t = dx || dy ? Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy))) : 0;
        const metres = Math.hypot(x+t*dx,y+t*dy), length = safety().distance(a,b), along = step.start+local+t*length;
        local += length;
        if (previousAlong !== null && (along < previousAlong-80 || along > previousAlong+Math.max(200,displacement*3))) continue;
        if (!best || metres < best.metres) best = {metres,along};
      }
    }
    return best;
  };
  const fitPadding = (size, requestedTop = 36) => {
    const height=Math.max(1,size.y),width=Math.max(1,size.x);
    const bottom=Math.min(92,height*.2),left=Math.min(30,width*.12),right=Math.min(78,width*.25);
    const top=Math.min(requestedTop,Math.max(0,height-bottom-Math.min(64,height*.4)));
    return {paddingTopLeft:[left,top],paddingBottomRight:[right,bottom]};
  };
  const compare = (a,b) => a.proneAreas-b.proneAreas || (a.areaBurden||0)-(b.areaBurden||0) || a.risk-b.risk || a.duration-b.duration;
  const chooseSafer = routes => [...routes].sort(compare)[0];
  const detourPoints = (start,end,zone) => {
    const latScale=111195, lngScale=latScale*Math.cos(zone.center[0]*Math.PI/180);
    const dx=(end[1]-start[1])*lngScale,dy=(end[0]-start[0])*latScale,length=Math.hypot(dx,dy)||1;
    const offset=zone.radius+600;
    return [1,-1].map(sign=>[zone.center[0]+sign*dx/length*offset/latScale,zone.center[1]-sign*dy/length*offset/lngScale]);
  };
  const create = callbacks => {
    const $ = id => document.getElementById(id);
    const synthesis = window.speechSynthesis, Utterance = window.SpeechSynthesisUtterance;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let route=null, steps=[], index=0, active=false, reviewing=false, along=null, lastPosition=null, spokenKey='', voice=false, recognition=null, listening=false;
    let dangerID=null, lastDangerKey='', announcedAreas=new Set(), warningUntil=0, noticeUntil=0;
    const approachBands = new Map(), thresholds = [20,50,100,150,200];
    let warningTimer = null, warningKind = null;
    const hideWarning = () => {
      clearTimeout(warningTimer); warningTimer=null; warningKind=null;
      $('dangerAlert').hidden=true;
    };
    const showWarning = (kind,title,location,detail) => {
      clearTimeout(warningTimer); warningKind=kind;
      $('dangerTitle').textContent=title; $('dangerLocation').textContent=location; $('dangerDetail').textContent=detail;
      $('dangerAlert').classList.toggle('is-approaching',kind==='approach');
      $('dangerReroute').textContent=route?'Safer route':'Plan a route';
      $('dangerAlert').hidden=false;
      warningTimer=setTimeout(hideWarning,3000);
    };
    const speak = (text, interrupt=false, priority=false) => {
      if (!voice || !synthesis || !Utterance || listening || (!priority && Date.now()<warningUntil)) return false;
      try { if(interrupt)synthesis.cancel();const utterance=new Utterance(text);utterance.lang='en-PH';utterance.rate=.95;synthesis.speak(utterance);return true; } catch { $('voiceStatus').textContent='Spoken guidance is unavailable. Follow the displayed instructions.'; }
    };
    const render = (distanceToTurn=null, feedback='') => {
      $('roadGuide').hidden=!route;
      $('guideDock').hidden=!route;
      if(!route)return;
      const step=steps[index];
      $('guideMode').textContent=active&&!reviewing?'Live guidance':'Route preview';
      $('guideInstruction').textContent=feedback || step?.text || 'Road steps unavailable for this route';
      $('guideDistance').textContent=feedback ? '' : distanceToTurn!==null ? (distanceToTurn<25?'Now': 'In '+safety().formatDistance(distanceToTurn)) : step ? 'Step '+(index+1)+' of '+steps.length : '';
      const minutes=Math.max(1,Math.ceil(route.duration/60));
      $('guideDuration').textContent=minutes<60 ? minutes+' min' : Math.floor(minutes/60)+' h'+(minutes%60?' '+minutes%60+' min':'');
      $('guideLength').textContent=safety().formatDistance(route.distance);
      $('guideTrip').textContent=$('guideDuration').textContent+' estimated, '+$('guideLength').textContent;
      $('guideManeuverPath').setAttribute('d',feedback ? (/reached/.test(feedback) ? maneuverPath({maneuver:{type:'arrive'}}) : 'M12 8v5m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18') : maneuverPath(step));
      $('roadGuide').classList.toggle('is-guiding',active&&!reviewing);
      $('previousGuide').disabled=!steps.length||index===0;
      $('nextGuide').disabled=!steps.length||index===steps.length-1;
      $('startGuidance').disabled=!steps.length;
      $('startGuidance').textContent=active&&reviewing?'Resume guidance':active?'Stop guidance':'Start guidance';
      $('startGuidance').setAttribute('aria-pressed',String(active));
      if(step && voice && active && !reviewing && !feedback){const key=index+':'+(distanceToTurn!==null&&distanceToTurn<=80?'near':'far');if(key!==spokenKey && speak((distanceToTurn>25?'In '+safety().formatDistance(distanceToTurn)+', ':'')+step.text,true))spokenKey=key;}
    };
    const repeat = () => { if(!route)return;spokenKey='';speak($('guideInstruction').textContent,true); };
    const setVoice = enabled => {
      voice=enabled && !!synthesis && !!Utterance;
      $('toggleVoice').setAttribute('aria-pressed',String(voice));$('toggleVoice').textContent=voice?'Voice on':'Voice off';
      if(!voice)synthesis?.cancel();else if(!$('dangerAlert').hidden){warningUntil=Date.now()+8000;speak($('dangerTitle').textContent+'. '+$('dangerLocation').textContent,true,true);}else repeat();
    };
    const review = delta => {if(!steps.length)return;reviewing=true;index=Math.max(0,Math.min(steps.length-1,index+delta));render();if(voice)repeat();};
    const toggleActive = () => {
      if(!route||!steps.length)return;
      if(active&&reviewing){reviewing=false;spokenKey='';$('guideStatus').textContent='Live guidance resumed. Waiting for the next GPS update.';render();return;}
      active=!active;reviewing=false;along=null;spokenKey='';noticeUntil=0;
      if(active){$('guideStatus').textContent='Waiting for precise GPS to update directions.';callbacks.onStart();}
      else {synthesis?.cancel();$('guideStatus').textContent='Preview mode. Location alerts remain available.';callbacks.onStop();}
      render();
    };
    const command = text => {
      const normalized=text.toLowerCase().replace(/[.,!?]/g,'').trim();
      $('voiceStatus').textContent='Heard: '+text;
      if(/^(safer route|reroute|re route|avoid accident areas)$/.test(normalized))callbacks.onReroute();
      else if(/^(repeat|repeat instruction|read directions)$/.test(normalized)){if(!voice)setVoice(true);else repeat();}
      else if(/^(next|next direction|next instruction)$/.test(normalized))review(1);
      else if(/^(previous|previous direction|previous instruction)$/.test(normalized))review(-1);
      else if(/^(fit route|show route)$/.test(normalized))callbacks.onFit();
      else if(/^(start guidance|start navigation|resume guidance)$/.test(normalized)){if(!active)toggleActive();else{reviewing=false;spokenKey='';render();}}
      else if(/^(stop guidance|stop navigation)$/.test(normalized)){if(active){reviewing=false;toggleActive();}}
      else if(/^(mute|voice off)$/.test(normalized))setVoice(false);
      else if(/^(unmute|voice on)$/.test(normalized))setVoice(true);
      else $('voiceStatus').textContent='Try "safer route", "repeat", "next", "fit route", or "stop guidance".';
    };
    const expandPreview = expanded => {
      $('guideContent').hidden=!expanded;
      $('toggleGuidePreview').setAttribute('aria-expanded',String(expanded));
      $('toggleGuidePreview').setAttribute('aria-label',expanded?'Minimize route preview':'Expand route preview');
      $('roadGuide').classList.toggle('is-compact',!expanded);
      $('guideDock').classList.toggle('is-compact',!expanded);
    };
    $('toggleGuidePreview').addEventListener('click',()=>expandPreview($('guideContent').hidden));
    $('guideFitRoute').addEventListener('click',()=>callbacks.onFit());
    $('previousGuide').addEventListener('click',()=>review(-1));
    $('nextGuide').addEventListener('click',()=>review(1));
    $('startGuidance').addEventListener('click',toggleActive);
    $('guideSaferRoute').addEventListener('click',()=>callbacks.onReroute());
    $('dangerReroute').addEventListener('click',()=>route?callbacks.onReroute():callbacks.onPlan());
    $('toggleVoice').addEventListener('click',()=>setVoice(!voice));
    $('toggleVoice').disabled=!synthesis||!Utterance;
    setVoice(true);
    $('voiceCommand').disabled=!Recognition;
    $('voiceStatus').textContent=Recognition?'Tap mic and say "safer route", "repeat", "next", or "stop guidance".':'Voice commands are unsupported in this browser. Use the buttons.';
    $('voiceCommand').addEventListener('click',()=>{
      if(!Recognition)return;
      if(listening){recognition?.abort();return;}
      synthesis?.cancel();
      recognition=new Recognition();recognition.lang='en-PH';recognition.continuous=false;recognition.interimResults=false;
      recognition.onstart=()=>{listening=true;$('voiceCommand').setAttribute('aria-pressed','true');$('voiceStatus').textContent='Listening for one command...';};
      recognition.onresult=event=>{const result=event.results?.[0]?.[0];if(result){listening=false;command(result.transcript);}};
      recognition.onerror=event=>{listening=false;$('voiceCommand').setAttribute('aria-pressed','false');$('voiceStatus').textContent=event.error==='not-allowed'?'Microphone permission denied. Use the route buttons.':'Could not hear a command. Tap mic to try again.';};
      recognition.onend=()=>{listening=false;$('voiceCommand').setAttribute('aria-pressed','false');};
      try{listening=true;recognition.start();}catch{listening=false;$('voiceStatus').textContent='Voice commands could not start. Use the buttons.';}
    });
    return {
      isActive:()=>active,
      setRoute(value){if(route?.geometry===value.geometry){route=value;render();return;}route=value;steps=stepsFor(value);index=0;along=null;lastPosition=null;reviewing=false;spokenKey='';$('guideStatus').textContent=steps.length?'':'The routing service did not return road instructions.';render();},
      clear(){expandPreview(true);route=null;steps=[];active=false;along=null;spokenKey='';synthesis?.cancel();recognition?.abort();$('roadGuide').hidden=true;$('guideDock').hidden=true;},
      setBusy(value){$('guideSaferRoute').textContent=value?'Checking...':'Safer route';$('guideSaferRoute').disabled=value||!route;$('dangerReroute').disabled=value;},
      updatePosition(point,accuracy){
        if(!active||!route||!steps.length)return;
        if(!point||accuracy>50){$('guideStatus').textContent='GPS is imprecise. Live directions are paused; preview steps remain available.';return;}
        const projection=projectProgress(steps,point,along,lastPosition?safety().distance(lastPosition,point):0);lastPosition=point;
        if(!projection||projection.metres>Math.max(60,accuracy*2)){render(null,'You are away from the selected route');$('guideStatus').textContent='Use Safer route to plan again from your current location.';return;}
        along=Math.max(along??0,projection.along);
        if(reviewing){$('guideStatus').textContent='Reviewing steps. Say "resume guidance" for live directions.';return;}
        const next=steps.findIndex(step=>step.start>along+15);
        index=next<0?steps.length-1:next;
        const step=steps[index], remaining=Math.max(0,step.start-along);
        const goal=steps.at(-1).point;
        if(step.maneuver.type==='arrive'&&safety().distance(point,goal)+accuracy<=30){active=false;callbacks.onStop();render(0,'You have reached the route destination');$('guideStatus').textContent='Route complete.';speak('You have reached the route destination.',true);return;}
        render(remaining);if(Date.now()>=noticeUntil)$('guideStatus').textContent='GPS guidance active. Follow posted signs and road conditions.';
      },
      updateDanger(zone,confirmed=true){
        if(!zone){if(dangerID!==null)hideWarning();dangerID=null;lastDangerKey='';return;}
        const key=zone.id+':'+confirmed+':'+zone.tier+':'+zone.name;
        const action=route?'Safer route':'Plan a route';
        if($('dangerReroute').textContent!==action)$('dangerReroute').textContent=action;
        if(lastDangerKey===key)return;
        lastDangerKey=key;dangerID=zone.id;
        if(confirmed)approachBands.set(zone.id,0);
        showWarning('entry',confirmed?'YOU ARE INSIDE AN ACCIDENT-PRONE AREA':'ACCIDENT-PRONE AREA NEARBY',zone.name,
          confirmed?(zone.tier==='critical'?'Critical-risk area. ':'High-risk area. ')+'Stay alert and consider a route around this area.':'GPS cannot confirm whether you have left the boundary. Stay alert.');
        $('dangerReroute').textContent=route?'Safer route':'Plan a route';
        if(confirmed&&!announcedAreas.has(zone.id)){announcedAreas.add(zone.id);if(listening){recognition?.abort();listening=false;}warningUntil=Date.now()+8000;speak('Warning. You are inside an accident-prone area. '+zone.name,true,true);}
      },
      updateApproach(zones,point,accuracy,exitBuffer=50){
        const nearby=zones.map(zone=>({zone,metres:safety().distance(point,zone.center)-zone.radius}));
        const validIDs=new Set(zones.map(zone=>zone.id));
        for(const id of approachBands.keys())if(!validIDs.has(id))approachBands.delete(id);
        nearby.forEach(item=>{if(item.metres>200+accuracy+exitBuffer)approachBands.delete(item.zone.id);});
        if(dangerID!==null || accuracy>50)return;
        const nearest=nearby.sort((a,b)=>a.metres-b.metres||b.zone.score-a.zone.score)[0];
        const threshold=nearest && thresholds.find(limit=>Math.max(0,nearest.metres)+accuracy<=limit);
        if(!threshold){if(warningKind==='approach')hideWarning();return;}
        if((approachBands.get(nearest.zone.id)??Infinity)<=threshold)return;
        approachBands.set(nearest.zone.id,threshold);
        showWarning('approach','ACCIDENT-PRONE AREA WITHIN '+threshold+' M',nearest.zone.name,'Stay alert. Distance to the area boundary is approximate, not driving distance.');
        if(listening){recognition?.abort();listening=false;}
        warningUntil=Date.now()+8000;
        speak('Warning. Accident-prone area within '+threshold+' metres. '+nearest.zone.name,true,true);
      },
      resetWarnings(){hideWarning();approachBands.clear();dangerID=null;lastDangerKey='';announcedAreas.clear();},
      dismissWarning:hideWarning,
      leaveArea(id){announcedAreas.delete(id);if(dangerID===id)this.updateDanger(null);},
      notice(message){noticeUntil=Date.now()+10000;$('guideStatus').textContent=message;speak(message,true);},
      pause(message){active=false;reviewing=false;synthesis?.cancel();callbacks.onStop();if(route){render();$('guideStatus').textContent=message;}},
      stop(){hideWarning();synthesis?.cancel();recognition?.abort();listening=false;},
      command
    };
  };
  return {instruction,stepsFor,projectProgress,chooseSafer,compare,detourPoints,fitPadding,create};
})();
