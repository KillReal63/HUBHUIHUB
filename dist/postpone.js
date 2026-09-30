let skippingKey=null;
const localMoment=()=>{const d=new Date();return today()+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const prettyMoment=moment=>new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(moment+':00Z'));
function skipEntry(){
 if(!skippingKey)return null;
 const [date,id,time]=skippingKey.split('|'),med=state.meds.find(m=>m.id===id);
 if(!med||state.taken[skippingKey]||state.skipped?.[skippingKey])return null;
 const base=date+'T'+time;return {med,base,moment:shiftedMoment(med,base),key:skippingKey};
}
function postponeTarget(x){
 const form=$('#skip-form'),mode=form.elements.postpone.value;
 if(mode==='skip')return null;
 if(mode==='custom')return form.elements.target.value;
 if(mode==='hour')return moveMoment(x.moment>localMoment()?x.moment:localMoment(),60);
 return moveMoment(x.moment,mode==='two'?2880:1440);
}
function updateSkipPreview(){
 const x=skipEntry();if(!x)return;
 const form=$('#skip-form'),mode=form.elements.postpone.value,custom=mode==='custom';
 $('#skip-custom-field').hidden=!custom;form.elements.target.disabled=!custom;
 const target=postponeTarget(x);
 $('#skip-submit').textContent=mode==='skip'?'Пропустить приём':'Перенести курс';
 $('#skip-preview').textContent=mode==='skip'?'Этот приём будет отмечен как пропущенный. Остальное расписание не изменится.':target&&form.elements.target.validity.valid?`Продолжить ${prettyMoment(target)}. Сдвинутся выбранный приём, последующие неотмеченные приёмы и окончание курса.`:'Укажи дату и время продолжения курса.';
}
function openSkip(key){
 skippingKey=key;const x=skipEntry();if(!x)return;
 const form=$('#skip-form');form.reset();$('#skip-error').textContent='';
 $('#skip-description').textContent=x.med.name+' · '+prettyMoment(x.moment);
 $('#skip-day-label').textContent=x.moment.slice(0,10)===today()?'На завтра':'На 1 день';
 form.elements.target.value=moveMoment(x.moment,1440);form.elements.target.min=moveMoment(x.moment>localMoment()?x.moment:localMoment(),1);
 updateSkipPreview();$('#skip-editor').showModal();$('#skip-title').focus();
}
$('#skip-close').onclick=()=>$('#skip-editor').close();
$('#skip-form').addEventListener('input',updateSkipPreview);
$('#skip-form').onsubmit=async event=>{
 event.preventDefault();if(busy||!authenticated)return;
 const x=skipEntry();if(!x){$('#skip-error').textContent='Приём уже изменился. Закрой окно и обнови расписание.';return}
 const target=postponeTarget(x),stamp=new Date().toISOString();
 if(target){
  const minutes=Math.round((new Date(target+':00Z')-new Date(x.moment+':00Z'))/60000);
  if(!Number.isInteger(minutes)||minutes<=0||minutes>525600||target<=localMoment()){$('#skip-error').textContent='Выбери время в будущем, позже текущего приёма, в пределах года.';return}
  const shifts=x.med.shifts||[];
  if(shifts.length>=200||shifts.reduce((n,s)=>n+s.minutes,0)+minutes>5256000){$('#skip-error').textContent='Достигнут предел переносов этого курса.';return}
  x.med.shifts=[...shifts,{from:x.base,minutes,at:stamp}];
 }else{
  state.skipped??={};state.fixed??={};state.skipped[x.key]=stamp;state.fixed[x.key]=x.moment;
 }
 $('#skip-submit').disabled=true;
 try{if(await save()){$('#skip-editor').close();toast(target?'Курс перенесён. Расписание и напоминания обновлены.':'Приём пропущен')}}finally{$('#skip-submit').disabled=false}
};
document.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||busy||!authenticated)return;
 if(button.dataset.skip)openSkip(button.dataset.skip);
 if(button.dataset.unskip){delete state.skipped[button.dataset.unskip];if(state.fixed)delete state.fixed[button.dataset.unskip];if(await save())toast('Пропуск отменён')}
 if(button.dataset.undoShift){
  const med=state.meds.find(m=>m.id===button.dataset.undoShift);if(!med?.shifts?.length)return;
  med.shifts=med.shifts.slice(0,-1);if(await save())toast('Последний перенос отменён. Отмеченные приёмы сохранены.')
 }
});
