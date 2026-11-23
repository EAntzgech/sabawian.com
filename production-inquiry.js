import {INQUIRY_CONFIG} from './production-inquiry-config.js';

let turnstileScript;
function loadTurnstile(){
  if(window.turnstile)return Promise.resolve();
  if(!turnstileScript)turnstileScript=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    const timer=setTimeout(()=>{script.remove();turnstileScript=null;reject(new Error('Security check unavailable.'));},15000);
    script.async=true;script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();turnstileScript=null;reject(new Error('Security check unavailable.'));};
    document.head.append(script);
  });
  return turnstileScript;
}
export function bindProductionInquiry(form,{config=INQUIRY_CONFIG,fetcher=fetch,securityCheck}={}){
  if(form.dataset.inquiryBound)return;form.dataset.inquiryBound='true';
  const status=form.querySelector('#inquiry-status'),submit=form.querySelector('button[type=submit]');
  const fields={name:form.querySelector('#producer-name'),email:form.querySelector('#producer-email'),engagement_type:form.querySelector('#inquiry-category'),brief:form.querySelector('#inquiry-details')};
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const trap=document.createElement('input');trap.type='text';trap.name='website';trap.tabIndex=-1;trap.autocomplete='off';trap.setAttribute('aria-hidden','true');
  Object.assign(trap.style,{position:'absolute',left:'-10000px',width:'1px',height:'1px',overflow:'hidden'});form.append(trap);
  const challenge=document.createElement('div');challenge.className='inquiry-security-check';form.append(challenge);
  let busy=false,payloadKey='',requestId='',widget,resolveToken,rejectToken,securityTimer;
  const verify=securityCheck||(async()=>{
    await loadTurnstile();
    return new Promise((resolve,reject)=>{
      const settle=(token,error)=>{clearTimeout(securityTimer);resolveToken=null;rejectToken=null;if(error)reject(new Error('Please retry the security check.'));else resolve(token);};
      resolveToken=token=>settle(token,false);rejectToken=()=>settle('',true);
      securityTimer=setTimeout(()=>{window.turnstile.reset(widget);settle('',true);},120000);
      try{
        if(widget===undefined)widget=window.turnstile.render(challenge,{sitekey:config.turnstileSiteKey,action:'production-inquiry',execution:'execute',appearance:'interaction-only',size:'flexible',
          callback:token=>resolveToken?.(token),'error-callback':()=>rejectToken?.(),'expired-callback':()=>rejectToken?.(),'timeout-callback':()=>rejectToken?.()});
        else window.turnstile.reset(widget);
        window.turnstile.execute(widget);
      }catch{settle('',true);}
    });
  });
  for(const field of Object.values(fields))field.addEventListener('input',()=>field.setCustomValidity(''));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const data=Object.fromEntries(Object.entries(fields).map(([k,f])=>[k,f.value.trim()]));
    for(const [key,message]of [['name','Name required'],['email','Valid email required'],['brief','Brief required']]){
      if(!data[key]){fields[key].setCustomValidity(message);fields[key].reportValidity();return;}
    }
    if(!form.reportValidity())return;
    if(config.endpoint.includes('YOUR_')||config.turnstileSiteKey.includes('YOUR_')){status.textContent='Failed to send inquiry';return;}
    const fingerprint=JSON.stringify(data);
    if(fingerprint!==payloadKey){payloadKey=fingerprint;requestId=crypto.randomUUID();}
    busy=true;form.setAttribute('aria-busy','true');status.textContent='Sending inquiry…';
    const controls=Array.from(form.querySelectorAll('input,select,textarea,button'));
    const states=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);
    const label=submit.textContent;submit.textContent='Sending…';
    try{
      const token=await verify();let result,response;
      for(let attempt=0;attempt<4;attempt++){
        response=await fetcher(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',
          body:JSON.stringify({...data,request_id:requestId,website:trap.value,turnstile_token:token}),signal:AbortSignal.timeout(45000)});
        result=await response.json();
        if(response.status!==202)break;
        await new Promise(r=>setTimeout(r,3000));
      }
      if(!response.ok||result?.ok!==true){
        if(result?.field&&fields[result.field])fields[result.field].setCustomValidity(result.detail||'Please check this field.');
        throw new Error(result?.detail||'Please try again.');
      }
      form.reset();payloadKey='';requestId='';status.textContent='Inquiry sent successfully';
    }catch(error){status.textContent='Failed to send inquiry'+(error?.message?' — '+error.message:'');}
    finally{controls.forEach((e,i)=>e.disabled=states[i]);submit.textContent=label;form.removeAttribute('aria-busy');busy=false;}
  });
}
const form=document.getElementById('producer-inquiry-form');if(form)bindProductionInquiry(form);
