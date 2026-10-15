'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (!window.workspaceUser) return;
  const form=document.getElementById('accidentForm');
  const response=document.getElementById('formResponse');
  const submit=document.getElementById('submitReport');
  const location=document.getElementById('location');
  const latitude=document.getElementById('latitude');
  const longitude=document.getElementById('longitude');
  const locationFeedback=document.getElementById('locationFeedback');
  const dialog=document.getElementById('mapModal');
  const search=document.getElementById('mapSearch');
  const searchButton=document.getElementById('mapSearchBtn');
  const searchStatus=document.getElementById('mapSearchStatus');
  const confirmLocation=document.getElementById('confirmMapLocation');
  const upload=document.getElementById('imageUpload');
  const preview=document.getElementById('imagePreview');
  let map, marker, draft, previewURL, submitting=false, dirty=false, locationRequest=0;
  const showFeedback=(message,success=false)=>{
    response.textContent=message;
    response.classList.toggle('success',success);
    response.focus();
  };
  const validPoint=(lat,lng)=>Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat))<=90 && Math.abs(Number(lng))<=180;
  const addressFor=async(lat,lng)=>{
    try {
      const result=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lng));
      if (!result.ok) throw new Error('Address lookup failed');
      const data=await result.json();
      return data.display_name || [lat.toFixed(6),lng.toFixed(6)].join(', ');
    } catch {return [lat.toFixed(6),lng.toFixed(6)].join(', ');}
  };
  const applyLocation=point=>{
    latitude.value=point.lat;
    longitude.value=point.lng;
    location.value=point.address;
    locationFeedback.textContent='Location selected: '+point.lat.toFixed(6)+', '+point.lng.toFixed(6);
    dirty=true;
  };
  const setDraft=(lat,lng,address)=>{
    if (!validPoint(lat,lng)) return;
    draft={lat:Number(lat),lng:Number(lng),address:address || Number(lat).toFixed(6)+', '+Number(lng).toFixed(6)};
    if (marker) map.removeLayer(marker);
    marker=L.marker([draft.lat,draft.lng]).addTo(map);
    confirmLocation.disabled=false;
    searchStatus.textContent='Selected: '+draft.address;
  };
  document.getElementById('plotLocationBtn').addEventListener('click',()=>{
    if(typeof L==='undefined') {locationFeedback.textContent='The map could not be loaded. Try reloading the page or use your current location.';return;}
    draft=null;
    confirmLocation.disabled=true;
    searchStatus.textContent='Select a point on the map, or search for a location.';
    dialog.showModal();
    try {
      if(!map){
        map=L.map('map').setView([16.70509,121.67633],11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
        map.on('click',async event=>{
          const token=++locationRequest;
          const {lat,lng}=event.latlng;
          setDraft(lat,lng);
          const address=await addressFor(lat,lng);
          if(token===locationRequest && dialog.open) setDraft(lat,lng,address);
        });
      }
      if(marker){map.removeLayer(marker);marker=null;}
      if(latitude.value!=='' && longitude.value!=='' && validPoint(latitude.value,longitude.value)) {
        setDraft(Number(latitude.value),Number(longitude.value),location.value);
        map.setView([Number(latitude.value),Number(longitude.value)],15);
      }
      map.invalidateSize();
    } catch {searchStatus.textContent='The map is unavailable. Close this window and try your current location.';}
  });
  document.getElementById('mapCloseBtn').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{locationRequest++;});
  confirmLocation.addEventListener('click',()=>{if(!draft)return;applyLocation(draft);dialog.close();});
  const searchLocation=async()=>{
    const term=search.value.trim();
    if(!term){searchStatus.textContent='Enter a town, barangay, or street to search.';return;}
    const token=++locationRequest;
    searchButton.disabled=true;
    searchStatus.textContent='Searching Isabela...';
    try {
      const result=await fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(term+', Isabela, Philippines')+'&bounded=1&viewbox=121.1,17.5,122.6,15.8');
      if(!result.ok)throw new Error('Search failed');
      const places=await result.json();
      if(token!==locationRequest || !dialog.open)return;
      if(!places.length){searchStatus.textContent='No matching location found. Try a more specific address or select a point on the map.';return;}
      const place=places[0];
      if(!validPoint(place.lat,place.lon))throw new Error('Invalid location');
      setDraft(Number(place.lat),Number(place.lon),place.display_name);
      map.setView([Number(place.lat),Number(place.lon)],15);
    }catch{searchStatus.textContent='Search is unavailable. You can still select a point on the map.';}
    finally{searchButton.disabled=false;}
  };
  searchButton.addEventListener('click',searchLocation);
  search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchLocation();}});
  document.getElementById('currentLocationBtn').addEventListener('click',event=>{
    const button=event.currentTarget;
    if(!navigator.geolocation){locationFeedback.textContent='Location services are unavailable in this browser.';return;}
    const token=++locationRequest;
    button.disabled=true;
    locationFeedback.textContent='Requesting your location...';
    navigator.geolocation.getCurrentPosition(async position=>{
      const lat=position.coords.latitude,lng=position.coords.longitude;
      const address=await addressFor(lat,lng);
      if(token===locationRequest)applyLocation({lat,lng,address});
      button.disabled=false;
    },()=>{locationFeedback.textContent='Your location could not be accessed. Check browser permissions or choose a point on the map.';button.disabled=false;},{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
  });
  const checkImage=()=>{
    const file=upload.files[0];
    if(!file)return true;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){showFeedback('Choose a JPEG, PNG, or WebP image.');return false;}
    if(file.size>5*1024*1024){showFeedback('Choose an image smaller than 5 MB.');return false;}
    return true;
  };
  upload.addEventListener('change',()=>{
    if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}
    preview.replaceChildren();
    if(!checkImage()){upload.value='';return;}
    if(upload.files[0]){
      previewURL=URL.createObjectURL(upload.files[0]);
      const image=document.createElement('img');
      image.src=previewURL;image.alt='Selected report photo preview';preview.appendChild(image);
    }
  });
  form.addEventListener('input',()=>{dirty=true;});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  const readImage=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Image could not be read'));reader.readAsDataURL(file);});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submitting || !form.reportValidity())return;
    if(latitude.value==='' || longitude.value==='' || !validPoint(latitude.value,longitude.value)) {showFeedback('Choose an event location on the map or use your current location before submitting.');document.getElementById('plotLocationBtn').focus();return;}
    if(!checkImage())return;
    const user=window.workspaceUser;
    if(!user?.user_id){showFeedback('Your sign-in session has no reporting account ID. Sign in with a registered account to submit a report. Your entries have been kept.');return;}
    submitting=true;submit.disabled=true;submit.setAttribute('aria-busy','true');
    response.textContent='Submitting your report...';response.classList.remove('success');
    try{
      const value=id=>document.getElementById(id).value;
      const types={'Hit another vehicle':1,'Hit person':2,'Hit object':3,'Fell alone':4};
      const severity={'No injuries':'Minor','Minor injuries':'Minor','Serious injuries':'Moderate','Fatal':'Severe'};
      const vehicleType=value('vehicleType');
      const payload={accident_date:value('accidentDate')+' '+value('accidentTime')+':00',latitude:Number(latitude.value),longitude:Number(longitude.value),address:location.value.trim(),description:value('description'),severity:severity[value('severity')],reported_by:user.user_id,type_id:types[value('accidentType')],category:vehicleType?'Vehicle':'Other',persons_involved:Number(value('personsInvolved'))||1,weather_condition:value('WeatherCondition')||null,vehicle:{plate_number:value('plateNumber')||null,type:vehicleType||null,brand:value('vehicleBrand')||null,model:value('vehicleModel')||null,color:value('vehicleColor')||null,year:value('vehicleYear')||null,notes:value('vehicleNotes')||null}};
      if(upload.files[0])payload.image=await readImage(upload.files[0]);
      const result=await postData('accident_api.php',payload);
      if(!result?.success){showFeedback('Your report could not be submitted. Your entries have been kept. Please try again later.');return;}
      form.reset();latitude.value='';longitude.value='';locationFeedback.textContent='';preview.replaceChildren();
      if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}
      if(marker && map){map.removeLayer(marker);marker=null;}
      dirty=false;
      showFeedback('Report submitted successfully. You can now view reports or create another.',true);
    }catch{showFeedback('Your report could not be submitted. Your entries have been kept. Check your connection and try again.');}
    finally{submitting=false;submit.disabled=false;submit.setAttribute('aria-busy','false');}
  });
});
