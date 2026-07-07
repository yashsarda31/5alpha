import{a as e,n as t,t as n}from"./jsx-runtime-DWSWI4JT.js";import{l as r}from"./ui-D0DeXp_q.js";var i=e(t(),1),a=n(),o=[{name:`The FOMO Beast`,emoji:`👺`,maxHp:100,description:`Attacks when you see green candles and buy without a plan.`,color:`#FF453A`},{name:`The Revenge Serpent`,emoji:`🐍`,maxHp:100,description:`Strikes after a loss, whispering to double your position sizing.`,color:`#FF9F0A`},{name:`The Overtrading Hydra`,emoji:`🐉`,maxHp:120,description:`Grows heads with every trade you enter just to 'feel something'.`,color:`#BF5AF2`},{name:`The Leverage Titan`,emoji:`👹`,maxHp:150,description:`Tempts you to risk 50% of your account on a single stock tip.`,color:`var(--primary-accent)`}],s=[{id:`shield`,name:`Stop-Loss Shield`,emoji:`🛡️`,description:`Protects discipline from drawdown. (+10% Sizing Mastery)`,category:`sizing`},{id:`elixir`,name:`Patience Elixir`,emoji:`🧪`,description:`Consolidation brew. (+15% Overtrade Resistance)`,category:`patience`},{id:`ledger`,name:`Ledger of Truth`,emoji:`📜`,description:`Exposes trading errors. (+10% Journal Mastery)`,category:`journal`},{id:`amulet`,name:`Zen Amulet`,emoji:`💎`,description:`Suppresses revenge trading. (+15% Calmness)`,category:`calm`},{id:`compass`,name:`Gold Trend Compass`,emoji:`🧭`,description:`Points towards high probability setups. (+10% Zen)`,category:`zen`},{id:`ruler`,name:`Ruler of Leverage`,emoji:`📏`,description:`Measures risk precisely. (+15% Sizing Mastery)`,category:`sizing`}],c={avatarName:`Zen Trader`,xp:0,level:1,streak:0,lastQuestDate:``,lastQuestCompletedDate:``,completedQuests:{sizing:!1,journal:!1,noOvertrade:!1,noRevenge:!1,calmness:!1},bossHp:100,bossDefeated:!1,inventory:[],equippedItemId:null,journalLogs:[],moodLogs:[],lastMoodDate:``,lastJournalDate:``,stats:{sizing:20,journal:20,noOvertrade:20,noRevenge:20,calmness:20}},l=e=>{let t=new Date().toISOString().split(`T`)[0];if(e.lastQuestDate===t)return e;let n={...e};if(n.lastQuestDate=t,n.completedQuests={sizing:!1,journal:!1,noOvertrade:!1,noRevenge:!1,calmness:!1},n.bossHp=o[new Date(t).getDate()%o.length].maxHp,n.bossDefeated=!1,e.lastQuestCompletedDate){let r=new Date(e.lastQuestCompletedDate),i=new Date(t),a=Math.abs(i-r);Math.ceil(a/(1e3*60*60*24))>1&&(n.streak=0)}return n},u=()=>{let[e,t]=(0,i.useState)(()=>{let e=localStorage.getItem(`alphanova_trading_game_state`);if(e)try{let t=JSON.parse(e);return l({...c,...t})}catch(e){return console.error(`Failed to parse game state:`,e),l(c)}return l(c)}),[n,u]=(0,i.useState)(!1),[d,f]=(0,i.useState)(e.avatarName),[p,m]=(0,i.useState)(``),[h,g]=(0,i.useState)({sizing:!1,overtrade:!1,revenge:!1,setup:!1}),[_,v]=(0,i.useState)(3),[y,b]=(0,i.useState)(``),[x,S]=(0,i.useState)([]),[C,w]=(0,i.useState)(!1),[T,E]=(0,i.useState)(!1),[D,O]=(0,i.useState)(null),k=(0,i.useRef)(null);(0,i.useEffect)(()=>{localStorage.setItem(`alphanova_trading_game_state`,JSON.stringify(e))},[e]);let A=o[new Date(e.lastQuestDate||new Date().toISOString().split(`T`)[0]).getDate()%o.length],j=(e,t,n)=>{let r=50+Math.random()*20,i=30+Math.random()*20;if(n&&n.current){let e=n.current.getBoundingClientRect();r=e.left+e.width/2+(Math.random()-.5)*50,i=e.top+e.height/3+(Math.random()-.5)*30}let a=Date.now()+Math.random().toString();S(n=>[...n,{id:a,x:r,y:i,text:e,type:t}]),setTimeout(()=>{S(e=>e.filter(e=>e.id!==a))},1200)},M=e=>e*200,N=(t,n=null)=>{let r=n||e,i=r.xp+t,a=r.level,o=!1;for(;i>=M(a);)i-=M(a),a+=1,o=!0;if(o){E(!0),setTimeout(()=>E(!1),4e3);let e=s.filter(e=>!r.inventory.includes(e.id)),t=[...r.inventory];if(e.length>0){let n=e[Math.floor(Math.random()*e.length)];t.push(n.id),O(n),setTimeout(()=>O(null),5e3)}return{...r,xp:i,level:a,inventory:t}}return{...r,xp:i}},P=e=>e===1?`Disciplined Rookie`:e===2?`Patience Apprentice`:e===3?`Risk Tactician`:e===4?`Zen Market Wizard`:`Legendary Market Master`,F=(n,r,i)=>{e.bossDefeated&&e.completedQuests[n];let a=new Date().toISOString().split(`T`)[0],o=!e.completedQuests[n];t(e=>{let t={...e.completedQuests,[n]:o},c=e.bossHp,l=e.bossDefeated,u=[...e.inventory];if(o&&(c=Math.max(0,e.bossHp-i),w(!0),setTimeout(()=>w(!1),500),j(`-${i} HP`,`damage`,k),j(`+${r} XP`,`xp`,k),c===0&&!e.bossDefeated)){l=!0,j(`+50 Boss Defeated XP!`,`xp`,k);let t=s.filter(t=>!e.inventory.includes(t.id));if(t.length>0){let e=t[Math.floor(Math.random()*t.length)];u.push(e.id),O(e),setTimeout(()=>O(null),5e3)}}let d=e.streak,f=e.lastQuestCompletedDate;if(o){if(!e.lastQuestCompletedDate)d=1;else if(e.lastQuestCompletedDate!==a){let t=new Date(e.lastQuestCompletedDate),n=new Date(a),r=Math.abs(n-t);Math.ceil(r/(1e3*60*60*24))===1?d+=1:d=1}f=a}let p={sizing:`sizing`,journal:`journal`,noOvertrade:`noOvertrade`,noRevenge:`noRevenge`,calmness:`calmness`}[n],m={...e.stats};o&&p&&(m[p]=Math.min(100,e.stats[p]+1));let h={...e,completedQuests:t,bossHp:c,bossDefeated:l,streak:d,lastQuestCompletedDate:f,inventory:u,stats:m};return o&&(h=N(r,h),c===0&&!e.bossDefeated&&(h=N(50,h))),h})},I=n=>{n.preventDefault();let r=new Date().toISOString().split(`T`)[0];if(e.lastMoodDate===r){alert(`You have already logged your mood for today. Keep maintaining discipline!`);return}t(e=>{let t=[...e.moodLogs,{date:r,mood:_,note:y}],n=e.bossDefeated||e.bossHp<=10,i=Math.max(0,e.bossHp-10);w(!0),setTimeout(()=>w(!1),500),j(`-10 HP`,`damage`,k),j(`+10 XP`,`xp`,k);let a={...e.stats,calmness:Math.min(100,e.stats.calmness+2)},o={...e,moodLogs:t,lastMoodDate:r,bossHp:i,bossDefeated:n,stats:a};return o=N(10,o),i===0&&!e.bossDefeated&&(o=N(50,o)),o}),b(``)},L=e=>{if(e.preventDefault(),!p.trim())return;let n=new Date().toISOString().split(`T`)[0],r={id:Date.now(),date:n,time:new Date().toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`}),entry:p,mood:_,tags:Object.keys(h).filter(e=>h[e])};t(e=>{let t=[r,...e.journalLogs],i={...e,journalLogs:t};if(e.lastJournalDate!==n){let t=e.bossDefeated||e.bossHp<=20,r=Math.max(0,e.bossHp-20);w(!0),setTimeout(()=>w(!1),500),j(`-20 HP`,`damage`,k),j(`+30 XP`,`xp`,k);let a={...e.stats,journal:Math.min(100,e.stats.journal+5)};i={...i,lastJournalDate:n,bossHp:r,bossDefeated:t,stats:a},i=N(30,i),r===0&&!e.bossDefeated&&(i=N(50,i))}else j(`Journal Logged!`,`xp`,k);return i}),m(``),g({sizing:!1,overtrade:!1,revenge:!1,setup:!1})},R=e=>{t(t=>{let n=t.equippedItemId===e?null:e;return{...t,equippedItemId:n}})},z=()=>{t(e=>({...e,avatarName:d})),u(!1)},B=()=>{let t=`data:text/json;charset=utf-8,`+encodeURIComponent(JSON.stringify(e,null,2)),n=document.createElement(`a`);n.setAttribute(`href`,t),n.setAttribute(`download`,`alphanova_discipline_state_${new Date().toISOString().split(`T`)[0]}.json`),document.body.appendChild(n),n.click(),n.remove()},V=e=>{let n=new FileReader;n.onload=e=>{try{let n=JSON.parse(e.target.result);n.level&&n.xp!==void 0?(t(n),alert(`Discipline state imported successfully!`)):alert(`Invalid state file structure!`)}catch{alert(`Failed to parse file. Ensure it is a valid JSON file exported from the Discipline Arena.`)}},e.target.files[0]&&n.readAsText(e.target.files[0])},H=()=>{window.confirm(`Are you sure you want to reset your discipline achievements, level, items, and streak? This action is permanent!`)&&(t(c),localStorage.removeItem(`alphanova_trading_game_state`))},U=s.find(t=>t.id===e.equippedItemId),W=t=>{let n=e.stats[t]||20;return U&&(t===`sizing`&&U.id===`shield`&&(n+=10),t===`sizing`&&U.id===`ruler`&&(n+=15),t===`noOvertrade`&&U.id===`elixir`&&(n+=15),t===`journal`&&U.id===`ledger`&&(n+=10),t===`calmness`&&U.id===`amulet`&&(n+=15),t===`calmness`&&U.id===`compass`&&(n+=10)),Math.min(100,n)};return(0,a.jsxs)(`div`,{className:`game-container`,style:{paddingBottom:`60px`},children:[(0,a.jsx)(`style`,{children:`
        .game-grid {
          display: grid;
          grid-template-columns: 1fr 1.3fr 1fr;
          gap: 24px;
        }
        @media (max-width: 1100px) {
          .game-grid {
            grid-template-columns: 1fr;
          }
        }
        .xp-bar-container {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          height: 14px;
          border: 1px solid var(--border-color);
          overflow: hidden;
          position: relative;
          margin: 12px 0;
        }
        .xp-bar-fill {
          background: linear-gradient(90deg, #b5952f 0%, #D4AF37 50%, #f7df8a 100%);
          height: 100%;
          border-radius: 20px;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 10px rgba(212, 175, 55, 0.3);
        }
        .boss-card {
          position: relative;
          text-align: center;
          padding: 30px;
          border-radius: 20px;
          background: rgba(18, 18, 18, 0.7);
          border: 1px solid var(--border-color);
          transition: all 0.3s ease;
          overflow: hidden;
        }
        .boss-card.shake {
          animation: bossShake 0.4s ease-in-out;
          border-color: #FF453A !important;
          box-shadow: 0 0 20px rgba(255, 69, 58, 0.3);
        }
        @keyframes bossShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .boss-emoji {
          font-size: 80px;
          line-height: 1;
          margin: 15px 0;
          display: inline-block;
          transition: transform 0.2s;
          filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.15));
        }
        .boss-emoji:hover {
          transform: scale(1.1);
        }
        .boss-hp-bar {
          background: rgba(255, 255, 255, 0.05);
          height: 20px;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          overflow: hidden;
          margin: 15px 0;
          position: relative;
        }
        .boss-hp-fill {
          background: linear-gradient(90deg, #9e2b25, #FF453A);
          height: 100%;
          transition: width 0.3s cubic-bezier(0.1, 0.8, 0.3, 1);
        }
        .quest-btn {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 12px;
          width: 100%;
          text-align: left;
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }
        .quest-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          border-color: rgba(255,255,255,0.2);
          transform: translateY(-2px);
        }
        .quest-btn.checked {
          background: rgba(50, 215, 75, 0.08);
          border-color: var(--green-gain);
          box-shadow: 0 0 12px rgba(50, 215, 75, 0.1);
        }
        .quest-checkbox {
          width: 20px;
          height: 20px;
          border: 2px solid var(--text-secondary);
          border-radius: 6px;
          margin-right: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .quest-btn.checked .quest-checkbox {
          border-color: var(--green-gain);
          background: var(--green-gain);
        }
        .quest-checkbox::after {
          content: '✓';
          color: #000;
          font-weight: 700;
          font-size: 13px;
          display: none;
        }
        .quest-btn.checked .quest-checkbox::after {
          display: block;
        }
        .equipped-glow {
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.4);
          border-color: var(--primary-gold) !important;
        }
        .floating-indicator {
          position: fixed;
          pointer-events: none;
          font-weight: 800;
          font-size: 20px;
          z-index: 9999;
          animation: floatUp 1.2s forwards cubic-bezier(0.1, 0.8, 0.3, 1);
        }
        @keyframes floatUp {
          0% { transform: translateY(0); opacity: 1; scale: 0.8; }
          100% { transform: translateY(-80px); opacity: 0; scale: 1.2; }
        }
        .stat-prog-bar {
          background: rgba(255,255,255,0.05);
          height: 6px;
          border-radius: 4px;
          overflow: hidden;
          margin-top: 6px;
        }
        .stat-prog-fill {
          height: 100%;
          background: var(--primary-accent);
          border-radius: 4px;
          transition: width 0.3s;
        }
        .level-up-modal {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(10px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.4s forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .level-up-box {
          text-align: center;
          background: rgba(30, 30, 30, 0.8);
          border: 2px solid var(--primary-gold);
          border-radius: 24px;
          padding: 50px 40px;
          max-width: 450px;
          box-shadow: 0 0 40px rgba(212, 175, 55, 0.4);
          animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes scaleIn {
          from { transform: scale(0.7); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .loot-notification {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: rgba(28, 28, 30, 0.95);
          border: 1px solid var(--primary-gold);
          box-shadow: 0 8px 30px rgba(212, 175, 55, 0.2);
          border-radius: 16px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          z-index: 9999;
          animation: slideInUp 0.4s cubic-bezier(0.1, 0.8, 0.3, 1);
        }
        @keyframes slideInUp {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .streak-badge {
          background: rgba(50, 215, 75, 0.1);
          border: 1px solid var(--green-gain);
          color: var(--green-gain);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          animation: pulseGreen 2s infinite;
        }
        @keyframes pulseGreen {
          0% { box-shadow: 0 0 0 0 rgba(50, 215, 75, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(50, 215, 75, 0); }
          100% { box-shadow: 0 0 0 0 rgba(50, 215, 75, 0); }
        }
        .tag-pill {
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border-color);
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-block;
          margin-right: 6px;
          user-select: none;
        }
        .tag-pill.active {
          background: rgba(62, 230, 255, 0.15);
          border-color: var(--primary-accent);
          color: var(--text-primary);
        }
      `}),x.map(e=>(0,a.jsx)(`div`,{className:`floating-indicator`,style:{left:`${e.x}px`,top:`${e.y}px`,color:e.type===`damage`?`#FF453A`:`#D4AF37`,textShadow:e.type===`damage`?`0 0 8px rgba(255, 69, 58, 0.5)`:`0 0 8px rgba(212, 175, 55, 0.5)`},children:e.text},e.id)),T&&(0,a.jsx)(`div`,{className:`level-up-modal`,children:(0,a.jsxs)(`div`,{className:`level-up-box`,children:[(0,a.jsx)(`h1`,{style:{color:`var(--primary-gold)`,fontSize:`42px`,marginBottom:`8px`},children:`LEVEL UP!`}),(0,a.jsx)(`div`,{style:{fontSize:`80px`,margin:`20px 0`},children:`🏆`}),(0,a.jsxs)(`h3`,{style:{fontSize:`24px`,marginBottom:`12px`},children:[`You reached Level `,e.level]}),(0,a.jsxs)(`p`,{style:{color:`var(--text-secondary)`,marginBottom:`30px`},children:[`Your mental discipline is strengthening. You are rising to the rank of `,(0,a.jsx)(`strong`,{style:{color:`var(--text-primary)`},children:P(e.level)}),`!`]}),(0,a.jsx)(`button`,{onClick:()=>E(!1),children:`Continue Quest`})]})}),D&&(0,a.jsxs)(`div`,{className:`loot-notification`,children:[(0,a.jsx)(`div`,{style:{fontSize:`30px`},children:D.emoji}),(0,a.jsxs)(`div`,{children:[(0,a.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--primary-gold)`,fontWeight:700,textTransform:`uppercase`},children:`New Loot Discovered!`}),(0,a.jsx)(`div`,{style:{fontSize:`14px`,fontWeight:600},children:D.name}),(0,a.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--text-secondary)`},children:`Added to your Inventory bag.`})]})]}),(0,a.jsx)(r,{code:`ARENA`,title:`Discipline Arena`,subtitle:`Gamify your psychology, risk controls, and trading consistency.`,right:(0,a.jsxs)(`div`,{style:{display:`flex`,gap:`12px`},children:[(0,a.jsx)(`button`,{className:`secondary`,style:{width:`auto`,padding:`10px 16px`,fontSize:`13px`},onClick:B,children:`Backup State`}),(0,a.jsxs)(`label`,{className:`secondary`,style:{width:`auto`,padding:`10px 16px`,fontSize:`13px`,background:`rgba(255,255,255,0.05)`,border:`1px solid var(--border-color)`,borderRadius:`10px`,cursor:`pointer`,display:`flex`,alignItems:`center`,margin:0},children:[`Restore`,(0,a.jsx)(`input`,{type:`file`,accept:`.json`,onChange:V,style:{display:`none`}})]}),(0,a.jsx)(`button`,{className:`secondary`,style:{width:`auto`,padding:`10px 16px`,fontSize:`13px`,borderColor:`rgba(255,69,58,0.2)`,color:`var(--red-loss)`},onClick:H,children:`Reset`})]})}),(0,a.jsxs)(`div`,{className:`game-grid`,children:[(0,a.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`24px`},children:[(0,a.jsxs)(`div`,{className:`card`,style:{marginBottom:0},children:[(0,a.jsxs)(`div`,{style:{textAlign:`center`,marginBottom:`20px`},children:[(0,a.jsxs)(`div`,{style:{position:`relative`,display:`inline-block`},children:[(0,a.jsx)(`div`,{style:{width:`90px`,height:`90px`,borderRadius:`50%`,background:`rgba(255,255,255,0.05)`,border:`2px solid var(--primary-gold)`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontSize:`44px`,boxShadow:`0 0 15px rgba(212, 175, 55, 0.2)`},children:U?U.emoji:`🧙‍♂️`}),e.streak>0&&(0,a.jsxs)(`div`,{className:`streak-badge`,style:{position:`absolute`,bottom:`-8px`,right:`-12px`},children:[`🔥 `,e.streak,`d`]})]}),n?(0,a.jsxs)(`div`,{style:{display:`flex`,gap:`8px`,marginTop:`16px`,justifyContent:`center`},children:[(0,a.jsx)(`input`,{type:`text`,value:d,onChange:e=>f(e.target.value),style:{padding:`6px 10px`,width:`150px`,marginBottom:0}}),(0,a.jsx)(`button`,{onClick:z,style:{width:`auto`,padding:`6px 12px`},children:`Save`})]}):(0,a.jsxs)(`h3`,{style:{marginTop:`16px`,display:`flex`,alignItems:`center`,justifyContent:`center`,gap:`6px`},children:[e.avatarName,(0,a.jsx)(`span`,{onClick:()=>u(!0),style:{fontSize:`13px`,cursor:`pointer`,opacity:.6},children:`✏️`})]}),(0,a.jsxs)(`div`,{style:{color:`var(--primary-gold)`,fontSize:`13px`,fontWeight:600,marginTop:`4px`},children:[`Level `,e.level,` • `,P(e.level)]})]}),(0,a.jsxs)(`div`,{children:[(0,a.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,fontSize:`12px`},children:[(0,a.jsx)(`span`,{style:{color:`var(--text-secondary)`},children:`XP Progress`}),(0,a.jsxs)(`span`,{children:[e.xp,` / `,M(e.level),` XP`]})]}),(0,a.jsx)(`div`,{className:`xp-bar-container`,children:(0,a.jsx)(`div`,{className:`xp-bar-fill`,style:{width:`${e.xp/M(e.level)*100}%`}})})]}),(0,a.jsxs)(`div`,{style:{marginTop:`24px`},children:[(0,a.jsx)(`h4`,{style:{fontSize:`14px`,marginBottom:`14px`,textTransform:`uppercase`,color:`var(--text-secondary)`,letterSpacing:`0.05em`},children:`Character Attributes`}),(0,a.jsxs)(`div`,{style:{marginBottom:`12px`},children:[(0,a.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,fontSize:`13px`},children:[(0,a.jsx)(`span`,{children:`🛡️ Sizing Mastery`}),(0,a.jsxs)(`span`,{style:{fontWeight:600},children:[W(`sizing`),`%`]})]}),(0,a.jsx)(`div`,{className:`stat-prog-bar`,children:(0,a.jsx)(`div`,{className:`stat-prog-fill`,style:{width:`${W(`sizing`)}%`,backgroundColor:`#32D74B`}})})]}),(0,a.jsxs)(`div`,{style:{marginBottom:`12px`},children:[(0,a.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,fontSize:`13px`},children:[(0,a.jsx)(`span`,{children:`📜 Journal Mastery`}),(0,a.jsxs)(`span`,{style:{fontWeight:600},children:[W(`journal`),`%`]})]}),(0,a.jsx)(`div`,{className:`stat-prog-bar`,children:(0,a.jsx)(`div`,{className:`stat-prog-fill`,style:{width:`${W(`journal`)}%`,backgroundColor:`var(--primary-accent)`}})})]}),(0,a.jsxs)(`div`,{style:{marginBottom:`12px`},children:[(0,a.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,fontSize:`13px`},children:[(0,a.jsx)(`span`,{children:`⏳ Patience (No Overtrade)`}),(0,a.jsxs)(`span`,{style:{fontWeight:600},children:[W(`noOvertrade`),`%`]})]}),(0,a.jsx)(`div`,{className:`stat-prog-bar`,children:(0,a.jsx)(`div`,{className:`stat-prog-fill`,style:{width:`${W(`noOvertrade`)}%`,backgroundColor:`#BF5AF2`}})})]}),(0,a.jsxs)(`div`,{style:{marginBottom:`12px`},children:[(0,a.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,fontSize:`13px`},children:[(0,a.jsx)(`span`,{children:`💎 Calmness (No Revenge)`}),(0,a.jsxs)(`span`,{style:{fontWeight:600},children:[W(`noRevenge`),`%`]})]}),(0,a.jsx)(`div`,{className:`stat-prog-bar`,children:(0,a.jsx)(`div`,{className:`stat-prog-fill`,style:{width:`${W(`noRevenge`)}%`,backgroundColor:`#FF9F0A`}})})]})]})]}),(0,a.jsxs)(`div`,{className:`card`,children:[(0,a.jsx)(`h3`,{style:{fontSize:`16px`,marginBottom:`4px`},children:`Equipment & Loot`}),(0,a.jsx)(`p`,{style:{color:`var(--text-secondary)`,fontSize:`12px`,marginBottom:`16px`},children:`Defeat bosses to earn gear. Click to equip passive buffs.`}),e.inventory.length===0?(0,a.jsxs)(`div`,{style:{padding:`24px 12px`,border:`1px dashed var(--border-color)`,borderRadius:`12px`,textAlign:`center`,color:`var(--text-secondary)`,fontSize:`13px`},children:[`Your inventory bag is currently empty.`,(0,a.jsx)(`br`,{}),`Defeat daily bosses to secure loot drops!`]}):(0,a.jsx)(`div`,{style:{display:`grid`,gridTemplateColumns:`repeat(3, 1fr)`,gap:`12px`},children:e.inventory.map(t=>{let n=s.find(e=>e.id===t);if(!n)return null;let r=e.equippedItemId===n.id;return(0,a.jsxs)(`div`,{onClick:()=>R(n.id),className:`inventory-slot ${r?`equipped-glow`:``}`,title:`${n.name}: ${n.description}`,style:{padding:`12px`,background:r?`rgba(212, 175, 55, 0.08)`:`rgba(255,255,255,0.02)`,border:r?`1px solid var(--primary-gold)`:`1px solid var(--border-color)`,borderRadius:`12px`,textAlign:`center`,cursor:`pointer`,transition:`all 0.2s`,position:`relative`},children:[(0,a.jsx)(`div`,{style:{fontSize:`32px`},children:n.emoji}),(0,a.jsx)(`div`,{style:{fontSize:`10px`,marginTop:`6px`,fontWeight:600,textOverflow:`ellipsis`,whiteSpace:`nowrap`,overflow:`hidden`},children:n.name}),r&&(0,a.jsx)(`div`,{style:{position:`absolute`,top:`4px`,right:`4px`,background:`var(--primary-gold)`,color:`#000`,borderRadius:`50%`,width:`12px`,height:`12px`,fontSize:`8px`,fontWeight:`bold`,display:`flex`,alignItems:`center`,justifyContent:`center`},children:`E`})]},n.id)})}),U&&(0,a.jsxs)(`div`,{style:{marginTop:`16px`,padding:`12px`,background:`rgba(212, 175, 55, 0.05)`,border:`1px solid rgba(212, 175, 55, 0.15)`,borderRadius:`10px`},children:[(0,a.jsxs)(`div`,{style:{fontSize:`12px`,fontWeight:`bold`,color:`var(--primary-gold)`},children:[`Active Buff: `,U.name]}),(0,a.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--text-secondary)`,marginTop:`2px`},children:U.description})]})]})]}),(0,a.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`24px`},children:[(0,a.jsx)(`div`,{ref:k,className:`boss-card ${C?`shake`:``}`,children:e.bossDefeated?(0,a.jsxs)(`div`,{style:{padding:`20px 0`},children:[(0,a.jsx)(`div`,{style:{fontSize:`72px`,animation:`scaleIn 0.5s`},children:`🏆`}),(0,a.jsx)(`h2`,{style:{color:`var(--green-gain)`,marginTop:`12px`},children:`Demon Slain!`}),(0,a.jsxs)(`p`,{style:{color:`var(--text-secondary)`,fontSize:`14px`,maxWidth:`300px`,margin:`0 auto 20px auto`},children:[`You defeated `,A.name,` for today. Your discipline remains unbroken!`]}),(0,a.jsx)(`div`,{style:{display:`inline-flex`,alignItems:`center`,gap:`8px`,background:`rgba(212, 175, 55, 0.1)`,border:`1px solid var(--primary-gold)`,padding:`6px 14px`,borderRadius:`12px`,color:`var(--primary-gold)`,fontSize:`13px`,fontWeight:600},children:`👑 Boss Defeated Loot Claimed`})]}):(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(`div`,{style:{position:`absolute`,top:`16px`,right:`16px`,background:`rgba(255,69,58,0.1)`,border:`1px solid rgba(255,69,58,0.3)`,borderRadius:`20px`,padding:`3px 10px`,fontSize:`11px`,color:`#FF453A`,fontWeight:600},children:`Daily Threat`}),(0,a.jsx)(`h3`,{style:{fontSize:`18px`,color:A.color},children:A.name}),(0,a.jsx)(`p`,{style:{color:`var(--text-secondary)`,fontSize:`12px`,margin:`4px 0 16px 0`,padding:`0 20px`},children:A.description}),(0,a.jsx)(`div`,{className:`boss-emoji`,children:A.emoji}),(0,a.jsxs)(`div`,{className:`boss-hp-bar`,children:[(0,a.jsx)(`div`,{className:`boss-hp-fill`,style:{width:`${e.bossHp/A.maxHp*100}%`}}),(0,a.jsxs)(`div`,{style:{position:`absolute`,top:0,left:0,right:0,bottom:0,display:`flex`,alignItems:`center`,justifyContent:`center`,fontSize:`11px`,fontWeight:700,textShadow:`0 1px 4px rgba(0,0,0,0.8)`},children:[`HP: `,e.bossHp,` / `,A.maxHp,` (`,Math.round(e.bossHp/A.maxHp*100)||0,`%)`]})]}),(0,a.jsx)(`div`,{style:{fontSize:`12px`,color:`var(--text-secondary)`},children:`Complete daily check-in tasks to deal damage!`})]})}),(0,a.jsxs)(`div`,{className:`card`,children:[(0,a.jsx)(`h3`,{style:{fontSize:`18px`,marginBottom:`4px`},children:`Daily Discipline Quests`}),(0,a.jsx)(`p`,{style:{color:`var(--text-secondary)`,fontSize:`12px`,marginBottom:`20px`},children:`Tick off rules you have successfully followed in today's sessions.`}),(0,a.jsxs)(`button`,{className:`quest-btn ${e.completedQuests.sizing?`checked`:``}`,onClick:()=>F(`sizing`,20,20),children:[(0,a.jsx)(`div`,{className:`quest-checkbox`}),(0,a.jsxs)(`div`,{style:{flex:1},children:[(0,a.jsx)(`div`,{style:{fontSize:`14px`,fontWeight:600},children:`Strict Position Sizing`}),(0,a.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--text-secondary)`},children:`Risked ≤ 1-2% capital per trade. No oversized gambling.`})]}),(0,a.jsx)(`div`,{style:{fontSize:`12px`,fontWeight:700,color:`var(--primary-gold)`},children:`+20 XP`})]}),(0,a.jsxs)(`button`,{className:`quest-btn ${e.completedQuests.journal?`checked`:``}`,onClick:()=>F(`journal`,20,20),children:[(0,a.jsx)(`div`,{className:`quest-checkbox`}),(0,a.jsxs)(`div`,{style:{flex:1},children:[(0,a.jsx)(`div`,{style:{fontSize:`14px`,fontWeight:600},children:`All Trades Journaled`}),(0,a.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--text-secondary)`},children:`Logged entries describing parameters, triggers, and plan.`})]}),(0,a.jsx)(`div`,{style:{fontSize:`12px`,fontWeight:700,color:`var(--primary-gold)`},children:`+20 XP`})]}),(0,a.jsxs)(`button`,{className:`quest-btn ${e.completedQuests.noOvertrade?`checked`:``}`,onClick:()=>F(`noOvertrade`,25,25),children:[(0,a.jsx)(`div`,{className:`quest-checkbox`}),(0,a.jsxs)(`div`,{style:{flex:1},children:[(0,a.jsx)(`div`,{style:{fontSize:`14px`,fontWeight:600},children:`Zero Overtrading`}),(0,a.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--text-secondary)`},children:`Stayed strictly within daily limit (e.g. max 3 setups).`})]}),(0,a.jsx)(`div`,{style:{fontSize:`12px`,fontWeight:700,color:`var(--primary-gold)`},children:`+25 XP`})]}),(0,a.jsxs)(`button`,{className:`quest-btn ${e.completedQuests.noRevenge?`checked`:``}`,onClick:()=>F(`noRevenge`,25,25),children:[(0,a.jsx)(`div`,{className:`quest-checkbox`}),(0,a.jsxs)(`div`,{style:{flex:1},children:[(0,a.jsx)(`div`,{style:{fontSize:`14px`,fontWeight:600},children:`Zero Revenge Trading`}),(0,a.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--text-secondary)`},children:`Did not chase. Stepped away from screen after hits.`})]}),(0,a.jsx)(`div`,{style:{fontSize:`12px`,fontWeight:700,color:`var(--primary-gold)`},children:`+25 XP`})]}),(0,a.jsxs)(`button`,{className:`quest-btn ${e.completedQuests.calmness?`checked`:``}`,onClick:()=>F(`calmness`,10,10),children:[(0,a.jsx)(`div`,{className:`quest-checkbox`}),(0,a.jsxs)(`div`,{style:{flex:1},children:[(0,a.jsx)(`div`,{style:{fontSize:`14px`,fontWeight:600},children:`Emotional Calmness & Zen`}),(0,a.jsx)(`div`,{style:{fontSize:`11px`,color:`var(--text-secondary)`},children:`Acknowledge market variance without frustration.`})]}),(0,a.jsx)(`div`,{style:{fontSize:`12px`,fontWeight:700,color:`var(--primary-gold)`},children:`+10 XP`})]})]})]}),(0,a.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`24px`},children:[(0,a.jsxs)(`div`,{className:`card`,children:[(0,a.jsx)(`h3`,{style:{fontSize:`18px`,marginBottom:`4px`},children:`Psychological Mood Logger`}),(0,a.jsx)(`p`,{style:{color:`var(--text-secondary)`,fontSize:`12px`,marginBottom:`16px`},children:`Rate your calm/happiness state before, during, or after trading.`}),(0,a.jsxs)(`form`,{onSubmit:I,children:[(0,a.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,padding:`0 8px`,marginBottom:`8px`},children:[(0,a.jsx)(`span`,{style:{fontSize:`24px`,opacity:_===1?1:.4,transition:`opacity 0.2s`,cursor:`pointer`},onClick:()=>v(1),children:`😤`}),(0,a.jsx)(`span`,{style:{fontSize:`24px`,opacity:_===2?1:.4,transition:`opacity 0.2s`,cursor:`pointer`},onClick:()=>v(2),children:`😐`}),(0,a.jsx)(`span`,{style:{fontSize:`24px`,opacity:_===3?1:.4,transition:`opacity 0.2s`,cursor:`pointer`},onClick:()=>v(3),children:`😊`}),(0,a.jsx)(`span`,{style:{fontSize:`24px`,opacity:_===4?1:.4,transition:`opacity 0.2s`,cursor:`pointer`},onClick:()=>v(4),children:`😄`}),(0,a.jsx)(`span`,{style:{fontSize:`24px`,opacity:_===5?1:.4,transition:`opacity 0.2s`,cursor:`pointer`},onClick:()=>v(5),children:`🔥`})]}),(0,a.jsx)(`input`,{type:`range`,min:`1`,max:`5`,value:_,onChange:e=>v(parseInt(e.target.value)),style:{marginBottom:`14px`,cursor:`pointer`}}),(0,a.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,fontSize:`11px`,color:`var(--text-secondary)`,marginTop:`-10px`,marginBottom:`16px`},children:[(0,a.jsx)(`span`,{children:`Highly Stressed`}),(0,a.jsx)(`span`,{children:`Perfect Calm`})]}),(0,a.jsx)(`label`,{children:`Psychological Notes / State`}),(0,a.jsx)(`input`,{type:`text`,placeholder:`e.g. Felt FOMO but closed chart. Mind is clear.`,value:y,onChange:e=>b(e.target.value),style:{padding:`10px 12px`,fontSize:`13px`,marginBottom:`14px`}}),(0,a.jsx)(`button`,{type:`submit`,disabled:e.lastMoodDate===new Date().toISOString().split(`T`)[0],style:{fontSize:`13px`,padding:`10px`},children:e.lastMoodDate===new Date().toISOString().split(`T`)[0]?`Mood Logged Today`:`Log Mood & Deal 10 Damage`})]})]}),(0,a.jsxs)(`div`,{className:`card`,children:[(0,a.jsx)(`h3`,{style:{fontSize:`18px`,marginBottom:`4px`},children:`Discipline Journal`}),(0,a.jsx)(`p`,{style:{color:`var(--text-secondary)`,fontSize:`12px`,marginBottom:`16px`},children:`Log lessons, rule breaks, or personal wins. Daily first log awards +30 XP.`}),(0,a.jsxs)(`form`,{onSubmit:L,children:[(0,a.jsx)(`label`,{children:`Journal Notes`}),(0,a.jsx)(`textarea`,{placeholder:`Write reflection... (e.g. accepted minor stop-loss immediately, kept position size small. Very happy with execution.)`,value:p,onChange:e=>m(e.target.value),required:!0,style:{width:`100%`,height:`80px`,background:`rgba(0,0,0,0.3)`,border:`1px solid var(--border-color)`,borderRadius:`10px`,padding:`12px`,color:`var(--text-primary)`,fontSize:`13px`,fontFamily:`inherit`,outline:`none`,resize:`none`,marginBottom:`12px`}}),(0,a.jsxs)(`div`,{style:{marginBottom:`16px`},children:[(0,a.jsx)(`span`,{style:{fontSize:`11px`,color:`var(--text-secondary)`,display:`block`,marginBottom:`6px`},children:`Attach Tags:`}),(0,a.jsx)(`span`,{className:`tag-pill ${h.sizing?`active`:``}`,onClick:()=>g(e=>({...e,sizing:!e.sizing})),children:`Sizing`}),(0,a.jsx)(`span`,{className:`tag-pill ${h.overtrade?`active`:``}`,onClick:()=>g(e=>({...e,overtrade:!e.overtrade})),children:`Overtrade`}),(0,a.jsx)(`span`,{className:`tag-pill ${h.revenge?`active`:``}`,onClick:()=>g(e=>({...e,revenge:!e.revenge})),children:`Revenge`}),(0,a.jsx)(`span`,{className:`tag-pill ${h.setup?`active`:``}`,onClick:()=>g(e=>({...e,setup:!e.setup})),children:`Setup Check`})]}),(0,a.jsx)(`button`,{type:`submit`,style:{fontSize:`13px`,padding:`10px`},children:`Save Journal Entry`})]})]})]})]}),(0,a.jsxs)(`div`,{className:`card`,style:{marginTop:`24px`},children:[(0,a.jsx)(`h3`,{style:{fontSize:`18px`,marginBottom:`4px`},children:`Discipline Logs History`}),(0,a.jsx)(`p`,{style:{color:`var(--text-secondary)`,fontSize:`12px`,marginBottom:`20px`},children:`A historical feed of your mental state and trading notes.`}),e.journalLogs.length===0?(0,a.jsx)(`div`,{style:{padding:`40px`,textAlign:`center`,color:`var(--text-secondary)`,border:`1px dashed var(--border-color)`,borderRadius:`12px`},children:`No journal entries recorded yet. Complete your first journal note to begin!`}):(0,a.jsx)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`14px`,maxHeight:`400px`,overflowY:`auto`,paddingRight:`6px`},children:e.journalLogs.map(e=>(0,a.jsxs)(`div`,{style:{padding:`16px`,background:`rgba(255,255,255,0.02)`,border:`1px solid var(--border-color)`,borderRadius:`12px`,display:`flex`,flexDirection:`column`,gap:`8px`},children:[(0,a.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,alignItems:`center`},children:[(0,a.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:`8px`},children:[(0,a.jsxs)(`span`,{style:{fontSize:`20px`},children:[e.mood===1&&`😤`,e.mood===2&&`😐`,e.mood===3&&`😊`,e.mood===4&&`😄`,e.mood===5&&`🔥`]}),(0,a.jsxs)(`span`,{style:{fontSize:`12px`,color:`var(--text-secondary)`},children:[e.date,` @ `,e.time]})]}),(0,a.jsx)(`div`,{style:{display:`flex`,gap:`6px`},children:e.tags&&e.tags.map(e=>(0,a.jsxs)(`span`,{style:{fontSize:`10px`,background:`rgba(62, 230, 255, 0.1)`,color:`var(--primary-accent)`,padding:`2px 8px`,borderRadius:`12px`,fontWeight:600},children:[`#`,e]},e))})]}),(0,a.jsx)(`p`,{style:{fontSize:`14px`,color:`var(--text-primary)`,whiteSpace:`pre-wrap`,lineHeight:`1.6`},children:e.entry})]},e.id))})]})]})};export{u as default};