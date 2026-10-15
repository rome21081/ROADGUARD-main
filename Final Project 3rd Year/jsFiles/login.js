'use strict';

const authNext=window.ROADGUARD.destination(new URLSearchParams(window.location.search).get('next'));
if(window.ROADGUARD.session()) window.location.replace(authNext);

document.addEventListener('DOMContentLoaded',()=>{
  const form=document.getElementById('loginForm')||document.getElementById('signupForm');
  const registering=form.id==='signupForm';
  const message=document.getElementById('authMessage');
  const submit=document.getElementById('authSubmit');
  const password=document.getElementById('password');
  const switchLink=document.getElementById('authSwitch');
  switchLink.href=(registering?'login.html':'signup.html')+'?next='+encodeURIComponent(authNext);
  const show=(text,success=false)=>{message.textContent=text;message.classList.toggle('success',success);};
  const signIn=user=>{
    localStorage.setItem('user',JSON.stringify(user));
    if(!window.ROADGUARD.session()) {localStorage.removeItem('user');throw new Error('Invalid account response');}
    window.location.replace(authNext);
  };
  document.getElementById('togglePassword').addEventListener('click',event=>{
    const showPassword=password.type==='password';password.type=showPassword?'text':'password';event.currentTarget.setAttribute('aria-label',showPassword?'Hide password':'Show password');
  });
  const demo=document.getElementById('demoLogin');
  if(demo)demo.addEventListener('click',()=>{try{signIn({username:'root',full_name:'Demo administrator',role:'admin',is_demo:true});}catch{show('Browser storage is unavailable. Enable storage to continue.');}});
  let busy=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;
    const username=document.getElementById('username').value.trim();
    if(!username){show('Enter a username or email.');return;}
    if(registering&&password.value!==document.getElementById('confirmPassword').value){show('The passwords do not match.');return;}
    busy=true;submit.disabled=true;submit.setAttribute('aria-busy','true');show(registering?'Creating your account...':'Signing you in...');
    try{
      if(!registering&&username==='root'&&password.value==='admin'){signIn({username:'root',full_name:'Demo administrator',role:'admin',is_demo:true});return;}
      const payload={username,password:password.value};
      if(registering){payload.full_name=document.getElementById('fullName').value.trim();payload.email=document.getElementById('email').value.trim();}
      const result=await postData(registering?'Signup.php':'Login.php',payload);
      if(!result?.success){show(registering?'Account creation is unavailable right now. Your entries have been kept; please try again later.':'Unable to sign in. Check your details and try again.');return;}
      if(registering){show('Account created. Sign in to continue.',true);const link=document.createElement('a');link.href=window.ROADGUARD.loginURL(authNext);link.textContent='Continue to sign in';message.appendChild(link);form.reset();}
      else if(result.user)signIn(result.user);
      else show('The sign-in response did not include an account. Please try again.');
    }catch{show('The request could not be completed. Please try again later.');}
    finally{busy=false;submit.disabled=false;submit.setAttribute('aria-busy','false');}
  });
});
