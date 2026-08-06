import { readFileSync } from 'node:fs';
import { foldChips } from './lib/chipsEngine';
const R=JSON.parse(readFileSync(process.argv[2],'utf8')); const r=R.result??R;
const st:any=foldChips({v:1,kind:'chips-table',name:'x',owner:'23b527bea8b9b185f3926b518545238696271dddbde4cf2c1abb23609e833cba'} as any,
  'sha256:5425dfcdce66b7d213ecc7091c4cdb3eb3607e3f12eb85299ef46c2b52d62df5',(r.replies??r.items) as any,new Map());
const edt=(ms:number)=>new Date(ms-4*3600e3).toISOString().slice(11,19);
const from=1785901860000; // 11:51:00 PM
console.log('FOLD ORDER around the tip (chain only):');
for (const m of st.moves as any[]) {
  if (m.ms>=from) console.log(`  ${edt(m.ms)}  ${String(m.outcome).padEnd(18)} ${m.upgradeKey??''}`);
}
console.log('\nfinal owned:', [...st.owned].sort().join(',') || '(none)');
console.log('crumbs', st.crumbs.toLocaleString(), ' cap', st.bowlCap.toLocaleString(), ' tips', st.tips);
