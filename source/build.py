"""Rebuild single-file Launch Jelly from the preserved original and explicit locale sources."""
from pathlib import Path
import json, re, hashlib
HERE=Path(__file__).resolve().parent
s=(HERE/'original.html').read_text()
strings=json.loads((HERE/'strings.json').read_text())
assert len(strings)>=284
s=s.replace('<title>发射果冻 · 我的任务发射台</title>','<title>Launch Jelly</title>')
s=s.replace('content="2026.10.26.mobile2.2"','content="2.0.0"')
s=s.replace('<span class="mobile-brand">发射果冻</span>','<span class="mobile-brand">Launch Jelly</span>')
s=s.replace('<strong>MATTER STUDIES</strong>','<strong>Launch Jelly</strong>')
s=s.replace('</small></div></div><div class="header-right">','</small></div><nav class="language-switch" aria-label="Language / 语言"><button type="button" data-lang="zh" lang="zh-CN" aria-label="切换到中文" aria-pressed="true">中文</button><button type="button" data-lang="en" lang="en" aria-label="Switch to English" aria-pressed="false">EN</button></nav></div><div class="header-right">',1)
s=s.replace('</style>','\n'+(HERE/'locale.css').read_text()+'\n</style>',1)
s=s.replace('id="taskDockName"','id="taskDockName" data-user-content')
prefix,js=s.split('<script>',1);js,tail=js.rsplit('</script>',1)
# Mark rendered user text so DOM audits and later UI extensions can explicitly exclude it.
for variable,assignment in [('title','task.title'),('title','record.name'),('tag','task.tag')]:
 js=js.replace(f'{variable}.textContent={assignment};',f'{variable}.dataset.userContent="";{variable}.textContent={assignment};')
js=js.replace("label.textContent='✓ '+task.title;", "label.dataset.userContent='';label.textContent='✓ '+task.title;")
js=js.replace("const meta=document.createElement('small');meta.textContent=", "const meta=document.createElement('small');meta.dataset.userContent='';meta.textContent=")
# Raw catalog entries remain data. Translate them only when their UI is rendered.
for field in ['title','kicker','description','why']:
 js=js.replace(f'.textContent=stop.{field};',f'.textContent=JLT(stop.{field});')
# Storage diagnostic keys stay in Chinese internally because prefix checks inspect them.
js=js.replace('status.title=taskStorageMessage;','status.title=JLT(taskStorageMessage);')
js=js.replace("note.textContent=!taskStorageAvailable?taskStorageMessage+", "note.textContent=!taskStorageAvailable?JLT(taskStorageMessage)+")
js=js.replace(":warning?taskStorageMessage+", ":warning?JLT(taskStorageMessage)+")
# Default names are initial data, not labels. Existing names, tasks, tags and archives are untouched.
# Locale-sensitive dates are rendered from numeric data and never modify saved fields.
old="function taskFormatDate(value){if(!value)return '';const [year,month,day]=value.split('-');return Number(month)+'月'+Number(day)+'日'+(Number(year)!==new Date().getFullYear()?' · '+year:'');}"
new="function taskFormatDate(value){if(!value)return '';const [year,month,day]=value.split('-').map(Number);return new Intl.DateTimeFormat(window.JellyLocale.language==='en'?'en-US':'zh-CN',{month:'short',day:'numeric',...(year!==new Date().getFullYear()?{year:'numeric'}:{})}).format(new Date(year,month-1,day));}"
assert old in js;js=js.replace(old,new)
js=js.replace("(date.getMonth()+1)+'月'+date.getDate()+'日 · '+record.total+' 项完成'", "new Intl.DateTimeFormat(window.JellyLocale.language==='en'?'en-US':'zh-CN',{month:'short',day:'numeric'}).format(date)+' · '+record.total+' 项完成'")
# Keep the public backup filename English in both languages.
js=js.replace("link.download='发射果冻-任务备份-'", "link.download='launch-jelly-backup-'")
# Exact string-literal transform. Shaders and procedural geometry are copied unchanged.
protected=[]
tour_start=js.index('const tourStops=[');tour_end=js.index('let presentationCameraTween=',tour_start)
protected.append((tour_start,tour_end))
for m in re.finditer(r"taskStorageMessage='(?:\\.|[^'\\\n])*'",js):protected.append((m.start(),m.end()))
for m in re.finditer(r"\.startsWith\('本地存档'\)",js):protected.append((m.start(),m.end()))
unknown=set();count=0
pattern=re.compile(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"")
def wrap(m):
 global count
 literal=m.group();raw=literal[1:-1]
 if not re.search('[\u4e00-\u9fff]',raw) or any(a<=m.start()<b for a,b in protected):return literal
 if raw not in strings:unknown.add(raw);return literal
 count+=1;return 'JLT('+literal+')'
js=pattern.sub(wrap,js)
assert not unknown,unknown
refresh=r'''
// Repaint labels only. No persistence call, input.value assignment, or user-data translation.
window.JellyLocale.onChange=()=>{
  renderTasks();syncPresentationUI();updatePresentationOverlay();
  const expanded=document.body.classList.contains('task-panel-expanded');
  if($('taskPanelToggle'))$('taskPanelToggle').textContent=JLT(expanded?'收起 ↓':'展开 ↑');
  if(S.running)$('launch').innerHTML=JLT(S.paused?'<b>继续庆祝</b><span>▶</span>':'<b>暂停庆祝</b><span>Ⅱ</span>');
  if(S.mission>=0)updateMission(0);
  $('sound').querySelector('span').textContent=JLT('声音 ')+(S.sound?'ON':'OFF');
  if(taskUndoRecord){
    const title=taskUndoRecord.task?.title||'';
    $('taskUndo').textContent=taskUndoRecord.kind==='import'?JLT('已恢复备份 · 撤销导入'):JLT('已删除「')+(title.length>15?title.slice(0,15)+'…':title)+JLT('」· 撤销');
  }
  for(const input of document.querySelectorAll('input'))input.setCustomValidity('');
  $('toast').classList.remove('show');
  queueViewportLayout();
};
window.JellyLocale.refresh();
'''
js=js.replace('// Prefer native WebGPU;',refresh+'\n// Prefer native WebGPU;',1)
# Runtime executes after static DOM exists and before app initialization.
runtime=(HERE/'locale.js').read_text().replace('__TRANSLATIONS__',json.dumps(strings,ensure_ascii=False,separators=(',',':')))
s=prefix+'<script>\n'+runtime+'\n</script><script>'+js+'</script>'+tail
out=HERE.parent/'index.html';out.write_text(s)
report={'version':'2.0.0','catalogKeys':len(strings),'localizedDynamicLiterals':count,'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'userStorageKey':'launch-jelly.tasks.v1','languageStorageKey':'launch-jelly.lang'}
(HERE.parent/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
