// 一日の流れ：予定・ToDo（生活全体のスケジュール）の計算部分。画面には依存しない。
// 2026-10-28 追加。毎日の流れ（logic.js）はそのままにして、その上に「予定」を重ねる。
//
// 予定（plan）の形：
//   { id, kind, title, date: 'YYYY-MM-DD' | null, time: 分 | null（null = 時間未定）, end: 分 | null, dur: 分 | null,
//     place, address, depart: 分 | null, departFrom, transport, memo, items: [持ち物],
//     importance: 1 低 / 2 中 / 3 高 / 4 最高, tentative: 仮予定, todo: ToDo として扱う, status: 'open' | 'done' | 'cancelled',
//     notify: { dayBefore, h4, m30, main, start, repeat, wake }（省略した項目は重要度の初期値）, wakeLead: 分,
//     checklist: [{ id, text, done }], confirm: [{ id, text, done }]（確認事項）,
//     legs: [{ id, from, to, name, dep: 分, arr: 分, how, move: 分, verified }]（移動。列車など）,
//     repeat: { freq: 'none' | 'daily' | 'weekly' | 'monthly', days: [1..7], until }, doneDates, skipDates,
//     acks: { 'YYYY-MM-DD.main': 時刻 }（「確認」を押した）, snoozes: [{ day, at }] }
(function (root) {
  'use strict';
  var L = typeof module !== 'undefined' && module.exports ? require('./logic.js') : root.DayLogic;
  var MIN = 60000;

  var KINDS = [['work', '仕事'], ['study', '勉強'], ['exercise', '運動'], ['medical', '通院'], ['travel', '旅行・外出'],
    ['family', '家族'], ['bank', '手続き（銀行など）'], ['todo', 'ToDo'], ['other', 'その他']];
  var KIND = {}; KINDS.forEach(function (k) { KIND[k[0]] = k[1]; });
  var IMP = { 1: '低', 2: '中', 3: '高', 4: '最高' };
  var TRANSPORT = { car: '自動車', train: '電車', walk: '徒歩', bus: 'バス', bike: '自転車', other: 'その他' };
  var DAY_BEFORE = 20 * 60;          // 前日の知らせ（20:00）
  var TODO_TIMES = [12 * 60, 14 * 60 + 30];   // 時刻のない重要なToDo：当日 12:00 と 14:30（済んでいなければ）
  var MORNING = 8 * 60;              // 朝のまとめ（8:00。早い出発がある日は前倒し）

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hm(m) { return m == null ? '' : L.todText(m); }
  function newId(prefix) { return (prefix || 'p') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  // ---- 重要度ごとの知らせの初期値（5章の決まり） ----
  //   低：開始（または出発）の1回。中：30分前と開始。高・最高：前日20:00・4時間前・30分前・開始、確認するまで鳴らし直す
  function defaultNotify(p) {
    var imp = p.importance || 2;
    return { dayBefore: imp >= 3, h4: imp >= 3, m30: imp >= 2, main: true, start: p.depart == null, repeat: imp >= 3, wake: imp >= 2 };
  }
  function notifyOf(p) { var d = defaultNotify(p), n = p.notify || {}; Object.keys(n).forEach(function (k) { if (n[k] != null) d[k] = n[k]; }); return d; }

  // ---- いつあるか ----
  function isRepeating(p) { return !!(p.repeat && p.repeat.freq && p.repeat.freq !== 'none'); }
  function occursOn(p, day) {
    if (!p || p.status === 'cancelled' || !p.date) return false;
    if ((p.skipDates || []).indexOf(day) >= 0) return false;
    if (!isRepeating(p)) return p.date === day;
    var r = p.repeat;
    if (day < p.date || (r.until && day > r.until)) return false;
    if (r.freq === 'daily') return true;
    if (r.freq === 'weekly') return ((r.days && r.days.length) ? r.days : [L.weekday(p.date)]).indexOf(L.weekday(day)) >= 0;
    if (r.freq === 'monthly') return day.slice(8) === p.date.slice(8);
    return false;
  }
  function isDone(p, day) { return isRepeating(p) ? !!(p.doneDates && p.doneDates[day]) : p.status === 'done'; }
  // 予定の時刻（その日のミリ秒）。base = 知らせの基準（出発があれば出発、なければ開始）
  function timesOf(p, day) {
    var start = p.time != null ? L.dateAt(day, p.time) : null;
    var end = null;
    if (p.end != null) end = L.dateAt(day, p.end) + (p.time != null && p.end < p.time ? 24 * 60 * MIN : 0);   // 日付をまたぐ
    else if (start != null && p.dur) end = start + p.dur * MIN;
    var depart = p.depart != null ? L.dateAt(day, p.depart) : null;
    return { start: start, end: end, depart: depart, base: depart != null ? depart : start };
  }
  function legTimes(p, day) {
    return (p.legs || []).filter(function (g) { return g.dep != null; }).map(function (g) {
      return { leg: g, dep: L.dateAt(day, g.dep), arr: g.arr != null ? L.dateAt(day, g.arr) + (g.arr < g.dep ? 24 * 60 * MIN : 0) : null };
    }).sort(function (a, b) { return a.dep - b.dep; });
  }
  function label(p) { return p.title + (p.place ? '（' + p.place + '）' : ''); }
  function itemsLine(p) { return p.items && p.items.length ? '持ち物：' + p.items.join('・') + '。' : ''; }
  function openCount(list) { return (list || []).filter(function (x) { return !x.done; }).length; }

  // ---- 1回ぶんの知らせ ----
  // 戻り値：[{ phase, at, title, body, rank }]。rank が大きいほど、近い時刻に重なったときに残す
  function notices(p, day) {
    if (!occursOn(p, day) || isDone(p, day)) return [];
    var n = notifyOf(p), t = timesOf(p, day), imp = p.importance || 2, out = [];
    var tent = p.tentative ? '【仮】' : '', acks = p.acks || {};
    function add(phase, at, title, body, rank) { out.push({ phase: phase, at: at, title: tent + title, body: body, rank: rank }); }
    var prev = L.addDays(day, -1);

    if (t.base == null) {
      // 時間未定の予定・時刻のないToDo
      if (n.dayBefore) add('dayBefore', L.dateAt(prev, DAY_BEFORE), '明日：' + label(p), p.todo ? 'やることがあります。' + confirmLine(p) : '時刻が未定です。' + (p.tbdNote || '時刻・場所・持ち物を確認しよう'), 1);
      if (p.todo && imp >= 3) TODO_TIMES.forEach(function (m, i) { add('todo' + (i + 1), L.dateAt(day, m), (i ? 'まだなら今のうちに：' : '今日やること：') + p.title, (confirmLine(p) || '') + '済んだら「完了」を押そう', 3); });
      else if (p.todo && imp === 2) add('todo1', L.dateAt(day, TODO_TIMES[0]), '今日やること：' + p.title, '済んだら「完了」を押そう', 3);
    } else {
      var base = t.base, dep = t.depart != null, at = L.fmtTime(base), startTxt = t.start != null ? L.fmtTime(t.start) : '';
      var what = dep ? at + ' に' + (p.departFrom ? p.departFrom + 'を' : '') + '出発' + (startTxt ? '（' + startTxt + ' 開始）' : '') : at + ' 開始';
      if (n.dayBefore) add('dayBefore', L.dateAt(prev, DAY_BEFORE), '明日 ' + (startTxt ? startTxt + ' ' : '') + label(p), (dep ? '出発は ' + at + '。' : '') + itemsLine(p) + '準備を確認しよう', 1);
      // 4時間前が夜中（23:00〜6:00）になる早朝の予定では、4時間前は出さない（前日20:00と起床の知らせで足りる）
      var h4tod = L.todOf(base - 240 * MIN);
      if (n.h4 && h4tod >= 6 * 60 && h4tod < 23 * 60) add('h4', base - 240 * MIN, '4時間後に' + (dep ? '出発' : '開始') + '：' + p.title, what + '。' + itemsLine(p), 2);
      if (n.m30) add('m30', base - 30 * MIN, '30分後に' + (dep ? '出発' : '開始') + '：' + p.title, (dep ? '出発の準備を始めよう。' : '向かう準備をしよう。') + itemsLine(p), 3);
      if (n.main) add('main', base, (dep ? '出発の時刻：' : '開始の時刻：') + p.title,
        dep ? (p.place || p.title) + ' へ出発しよう' + (p.transport ? '（' + (TRANSPORT[p.transport] || p.transport) + '）' : '') + (startTxt ? '。' + startTxt + ' 開始' : '') : label(p), 4);
      if (dep && n.start && t.start != null) add('start', t.start, '開始の時刻：' + p.title, label(p), 4);
      // 確認するまで鳴らし直す（アプリで「確認」を押すと止まる）
      if (n.repeat && n.main && !acks[day + '.main']) {
        for (var k = 1; k <= (imp >= 4 ? 6 : 3); k++) add('rep' + k, base + k * 5 * MIN, 'もう一度：' + p.title, (dep ? '出発の時刻です。' : '始まる時刻です。') + 'アプリで「確認」を押すと止まります', 0);
      }
      // 8:00 より前に出発・開始する予定は、起床の知らせを入れる（確認するまで2分おき）
      if (n.wake && imp >= 2 && L.todOf(base) < MORNING) {
        var wakeAt = base - (p.wakeLead || 90) * MIN;
        add('wake', wakeAt, '起きよう：' + p.title, what + '。' + itemsLine(p), 5);
        if (!acks[day + '.wake']) for (var w = 1; w <= 5; w++) add('wake' + w, wakeAt + w * 2 * MIN, '起きよう（もう一度）：' + p.title, 'アプリで「確認」を押すと止まります', 0);
      }
    }
    // 移動（列車など）：乗り場へ向かう時刻と、発車の時刻。確かめていない時刻は「目安」と書く
    legTimes(p, day).forEach(function (x) {
      var g = x.leg, mv = g.move != null ? g.move : 10, un = g.verified ? '' : '（時刻は目安・未確認）';
      var line = (g.name ? g.name + ' ' : '') + L.fmtTime(x.dep) + ' ' + (g.from || '') + '発 → ' + (g.to || '') + (x.arr ? ' ' + L.fmtTime(x.arr) + '着' : '');
      if (mv > 0) add('leg.' + g.id + '.go', x.dep - mv * MIN, L.fmtTime(x.dep - mv * MIN) + ' までに' + (g.from ? g.from + 'の' : '') + '乗り場へ', line + (g.how ? '。' + g.how : '') + un, 3);
      add('leg.' + g.id + '.dep', x.dep, L.fmtTime(x.dep) + ' ' + (g.name || '列車') + 'が出発します', (g.from || '') + ' → ' + (g.to || '') + (x.arr ? '（' + L.fmtTime(x.arr) + '着）' : '') + un, 4);
    });
    // スヌーズ（5分後・10分後）
    (p.snoozes || []).forEach(function (s, i) { if (s.day === day) add('snooze' + i, s.at, 'スヌーズ：' + p.title, '時間です。' + (t.base != null ? L.fmtTime(t.base) + ' の予定' : '確認しよう'), 5); });
    // 近い時刻（2分以内）に重なったら、大事なほうを残す
    out.sort(function (a, b) { return a.at - b.at || b.rank - a.rank; });
    var kept = [];
    out.forEach(function (x) {
      var last = kept[kept.length - 1];
      if (last && x.at - last.at < 2 * MIN) { if (x.rank > last.rank) kept[kept.length - 1] = x; return; }
      kept.push(x);
    });
    return kept;
  }
  function confirmLine(p) { var c = (p.confirm || []).filter(function (x) { return !x.done; }); return c.length ? '確認：' + c.map(function (x) { return x.text; }).join('・') + '。' : ''; }

  // ---- その日の一覧 ----
  // 予定（時刻順。時間未定は最後）と、前の日から続いている予定
  function dayPlans(plans, day) {
    var out = [];
    (plans || []).forEach(function (p) {
      if (occursOn(p, day)) out.push({ p: p, day: day, t: timesOf(p, day), done: isDone(p, day), cont: false });
      else {
        var prev = L.addDays(day, -1);
        if (occursOn(p, prev) && p.time != null && p.end != null && p.end < p.time) out.push({ p: p, day: prev, t: timesOf(p, prev), done: isDone(p, prev), cont: true });
      }
    });
    return out.sort(function (a, b) {
      var x = a.cont ? -1 : a.t.base != null ? a.t.base : Infinity, y = b.cont ? -1 : b.t.base != null ? b.t.base : Infinity;
      return x - y || (b.p.importance || 2) - (a.p.importance || 2);
    });
  }
  // ToDo：済んでいない、今日のもの・期限のないもの。重要度が高いものは、日付が過ぎても済むまで残す。重要度 → 期限の順
  function todosFor(plans, day) {
    return (plans || []).filter(function (p) {
      if (!p.todo || p.status === 'cancelled') return false;
      if (p.date && isRepeating(p)) return occursOn(p, day) && !isDone(p, day);
      if (p.status === 'done') return false;
      return !p.date || p.date === day || (p.date < day && (p.importance || 2) >= 3);
    }).sort(function (a, b) { return (b.importance || 2) - (a.importance || 2) || String(a.date || '9').localeCompare(String(b.date || '9')); });
  }
  // 未完了の重要なToDo（重要度 高以上）。期限が2日以内か、期限なし
  function importantOpen(plans, day) {
    var lim = L.addDays(day, 2);
    return (plans || []).filter(function (p) {
      return p.todo && (p.importance || 2) >= 3 && p.status !== 'done' && p.status !== 'cancelled' && !isRepeating(p) && (!p.date || p.date <= lim);
    }).sort(function (a, b) { return String(a.date || '9').localeCompare(String(b.date || '9')) || (b.importance || 2) - (a.importance || 2); });
  }
  // 次の予定（出発・開始・列車）。now より後でいちばん早いもの
  function nextUp(plans, now) {
    var best = null, today = L.dayKey(now);
    [today, L.addDays(today, 1)].forEach(function (day) {
      dayPlans(plans, day).forEach(function (x) {
        if (x.cont || x.done) return;
        var cands = [];
        if (x.t.depart != null) cands.push({ at: x.t.depart, what: '出発' });
        if (x.t.start != null) cands.push({ at: x.t.start, what: '開始' });
        legTimes(x.p, day).forEach(function (g) { cands.push({ at: g.dep, what: (g.leg.name || '列車') + ' 発車' }); });
        cands.forEach(function (c) { if (c.at > now && (!best || c.at < best.at)) best = { at: c.at, what: c.what, p: x.p, day: day }; });
      });
    });
    return best;
  }

  // ---- 毎日の流れ（logic.js）から、その日の勉強と運動 ----
  function routineOf(day, s, data) {
    var ds = (data.days && data.days[day]) || L.newDay(day), wd = L.weekday(day), out = { study: [], exercise: null, off: !!ds.routineOff };
    if (ds.routineOff) return out;
    L.NIGHT_STEPS.forEach(function (id) {
      if (!L.stepOn(id, s, wd, ds)) return;
      var np = L.nightPart(s, wd, id);
      out.study.push(L.todText(s.steps[id].time) + ' ' + (np ? np.subject + '・' + np.kind : L.INFO[id].title));
    });
    ['extraStudy1', 'extraStudy2'].forEach(function (id) { if (L.stepOn(id, s, wd, ds)) out.study.unshift(L.todText(s.steps[id].time) + ' ' + L.INFO[id].title); });
    ['morningStudy1', 'morningStudy2'].forEach(function (id, i) { if (L.stepOn(id, s, wd, ds)) out.study.splice(i, 0, L.todText(s.steps[id].time) + ' ' + L.INFO[id].title); });
    if (L.stepOn('workout', s, wd, ds)) {
      var w = s.workout.days[wd] || { type: 'rest' };
      if (w.type !== 'rest') out.exercise = L.todText(s.steps.workout.time) + ' ' + L.DAY_TYPE[w.type];
    }
    return out;
  }

  // ---- 朝のまとめ ----
  // 8:00 が基本。8:45 より前に出発・開始する予定がある日は、その45分前に前倒し（4:30 より早くはしない。起床の知らせと重ならないよう45分前）
  function morning(day, plans, s, data) {
    var list = dayPlans(plans, day).filter(function (x) { return !x.done && !x.p.todo; });
    var todos = todosFor(plans, day), r = routineOf(day, s, data), first = null;
    list.forEach(function (x) { if (!x.cont && x.t.base != null && (first == null || x.t.base < first)) first = x.t.base; });
    var at = L.dateAt(day, MORNING);
    if (first != null && first - 45 * MIN < at) at = Math.max(first - 45 * MIN, L.dateAt(day, 4 * 60 + 30));
    var notes = [];
    list.forEach(function (x) {
      if (x.cont) return;
      if (x.t.depart != null) notes.push(L.fmtTime(x.t.depart) + ' 出発（' + x.p.title + '）');
      if (x.p.items && x.p.items.length) notes.push(x.p.title + 'の持ち物：' + x.p.items.join('・'));
      if (x.t.base == null) notes.push(x.p.title + 'は時刻が未定');
      if (x.p.tentative) notes.push(x.p.title + 'は仮の予定');
      var un = (x.p.legs || []).filter(function (g) { return !g.verified && g.dep != null; }).length;
      if (un) notes.push(x.p.title + '：列車の時刻が未確認（' + un + '件）');
      var c = openCount(x.p.confirm);
      if (c) notes.push(x.p.title + '：確認事項が' + c + '件');
    });
    // 明日までに準備が要るもの・期限の近い手続き
    var tomorrow = L.addDays(day, 1);
    dayPlans(plans, tomorrow).forEach(function (x) { if (!x.cont && !x.done && (x.p.importance || 2) >= 3) notes.push('明日：' + (x.t.base != null ? L.fmtTime(x.t.base) + ' ' : '') + x.p.title); });
    importantOpen(plans, day).forEach(function (p) { if (p.date && p.date > L.addDays(day, 1)) notes.push(L.shortLabel(p.date) + 'まで：' + p.title); });
    var sections = [
      { key: 'plans', title: '今日の予定', lines: list.map(function (x) {
        return (x.cont ? '（前日から）' : x.t.base == null ? '時間未定 ' : (x.t.depart != null ? L.fmtTime(x.t.depart) + ' 出発→' : '') + (x.t.start != null ? L.fmtTime(x.t.start) + ' ' : '')) + label(x.p);
      }) },
      { key: 'todo', title: '今日やること', lines: todos.map(function (p) { return '【' + IMP[p.importance || 2] + '】' + p.title + (p.date && p.date < day ? '（' + L.shortLabel(p.date) + 'から）' : ''); }) },
      { key: 'study', title: '今日の勉強', lines: r.off ? ['お休み（予定を優先する日）'] : r.study },
      { key: 'exercise', title: '今日の運動', lines: r.off ? ['お休み（予定を優先する日）'] : r.exercise ? [r.exercise] : [] },
      { key: 'notes', title: '注意事項', lines: notes }
    ];
    var short = [];
    short.push('予定：' + (list.length ? list.map(function (x) { return (x.t.base != null && !x.cont ? L.fmtTime(x.t.depart != null ? x.t.depart : x.t.start) + (x.t.depart != null ? '出発 ' : ' ') : '') + x.p.title; }).join('、') : 'なし'));
    if (todos.length) short.push('やること：' + todos.slice(0, 3).map(function (p) { return p.title; }).join('、') + (todos.length > 3 ? ' ほか' + (todos.length - 3) + '件' : ''));
    if (!r.off && r.study.length) short.push('勉強：' + r.study.filter(function (x) { return /^2\d:/.test(x); }).map(function (x) { return x.replace(/^\d+:\d+ /, ''); }).join('→'));
    if (!r.off && r.exercise) short.push('運動：' + r.exercise.replace(/^\d+:\d+ /, ''));
    if (notes.length) short.push('注意：' + notes.slice(0, 2).join('／'));
    var body = short.join('\n');
    if (body.length > 230) body = body.slice(0, 229) + '…';
    var a = day.split('-').map(Number);
    return { at: at, title: '今日の予定（' + a[1] + '/' + a[2] + ' ' + L.WD[L.weekday(day)] + '）', body: body, sections: sections };
  }

  // ---- サーバーに預ける知らせ（毎日の流れと合わせて、近い順に380件まで） ----
  function pushItems(now, s, data, days, appUrl) {
    var plans = data.plans || [], first = L.dayKey(now), end = now + days * 24 * 60 * MIN, out = L.pushItems(now, s, data, days).slice();
    var url = function (hash) { return appUrl ? appUrl + '#' + hash : undefined; };
    for (var i = 0; i <= days; i++) {
      var day = L.addDays(first, i);
      plans.forEach(function (p) {
        notices(p, day).forEach(function (x) {
          if (x.at <= now || x.at > end) return;
          out.push({ id: day + '.plan.' + p.id + '.' + x.phase, at: x.at, title: x.title, body: x.body, url: url('plan=' + p.id + '&day=' + day) });
        });
      });
      if (s.morningSummary !== false) {
        var m = morning(day, plans, s, data);
        if (m.at > now && m.at <= end) out.push({ id: day + '.morning', at: m.at, title: m.title, body: m.body, url: url('today=' + day) });
      }
    }
    out.forEach(function (x) { if (x.url === undefined) delete x.url; });
    return out.sort(function (a, b) { return a.at - b.at || (a.id < b.id ? -1 : 1); }).slice(0, 380);
  }

  // ---- iPhone の「カレンダー」に入れるファイル（.ics） ----
  // カレンダーの通知は端末の中で鳴るので、通信がなくても・アプリを閉じていても届く。1件につき2つまで入れる
  function icsText(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsUtc(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsDate(day) { return day.replace(/-/g, ''); }
  function fold(line) {
    // 75バイトごとに折り返す（文字の途中では切らない）
    var out = [], cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], code = line.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) { ch += line[++i]; }
      var b = code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdbff ? 4 : 3;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function ics(list, now) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ichinichi//schedule//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    list.forEach(function (x) {
      var p = x.p, day = x.day, t = timesOf(p, day), n = notifyOf(p);
      var desc = [p.memo, p.depart != null ? '出発：' + hm(p.depart) + (p.departFrom ? '（' + p.departFrom + '）' : '') : '', p.items && p.items.length ? '持ち物：' + p.items.join('・') : '',
        (p.legs || []).map(function (g) { return (g.name || '') + ' ' + hm(g.dep) + ' ' + (g.from || '') + '→' + (g.to || '') + ' ' + hm(g.arr) + (g.verified ? '' : '（未確認）'); }).join('\n'),
        confirmLine(p)].filter(Boolean).join('\n');
      lines.push('BEGIN:VEVENT', 'UID:' + p.id + '-' + day + '@ichinichi', 'DTSTAMP:' + icsUtc(now));
      var alarms = [];
      if (t.base == null) {
        lines.push('DTSTART;VALUE=DATE:' + icsDate(day), 'DTEND;VALUE=DATE:' + icsDate(L.addDays(day, 1)));
        if (n.dayBefore) alarms.push('-PT4H');       // 前日 20:00
        if (p.todo) alarms.push('PT12H');            // 当日 12:00
        if (!alarms.length) alarms.push('PT8H');
      } else {
        var st = t.start != null ? t.start : t.base, en = t.end != null ? t.end : st + (p.dur || 60) * MIN;
        lines.push('DTSTART:' + icsUtc(st), 'DTEND:' + icsUtc(Math.max(en, st + 15 * MIN)));
        var rel = function (at) { var m = Math.round((st - at) / MIN); return m > 0 ? '-PT' + m + 'M' : m < 0 ? 'PT' + (-m) + 'M' : 'PT0M'; };
        if (n.m30 || (p.importance || 2) >= 3) alarms.push(rel(t.base - 30 * MIN));
        alarms.push(rel(t.base));
      }
      lines.push('SUMMARY:' + icsText((p.tentative ? '【仮】' : '') + p.title));
      if (p.place || p.address) lines.push('LOCATION:' + icsText([p.place, p.address].filter(Boolean).join(' ')));
      if (desc) lines.push('DESCRIPTION:' + icsText(desc));
      alarms.slice(0, 2).forEach(function (tr) { lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(p.title), 'TRIGGER:' + tr, 'END:VALARM'); });
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // ---- 地図・乗換案内のリンク（確かめるための入口。時刻はこちらでは決めない） ----
  function enc(s) { return encodeURIComponent(s || ''); }
  function mapUrl(q) { return 'https://maps.apple.com/?q=' + enc(q); }
  function routeUrl(from, to, mode) { return 'https://maps.apple.com/?' + (from ? 'saddr=' + enc(from) + '&' : '') + 'daddr=' + enc(to) + '&dirflg=' + (mode === 'train' || mode === 'bus' ? 'r' : mode === 'walk' ? 'w' : 'd'); }
  function googleRouteUrl(from, to, mode) { return 'https://www.google.com/maps/dir/?api=1' + (from ? '&origin=' + enc(from) : '') + '&destination=' + enc(to) + '&travelmode=' + (mode === 'train' || mode === 'bus' ? 'transit' : mode === 'walk' ? 'walking' : 'driving'); }
  function transitUrl(from, to, day, minutes) {
    var a = day.split('-');
    return 'https://transit.yahoo.co.jp/search/result?from=' + enc(from) + '&to=' + enc(to) + '&y=' + a[0] + '&m=' + a[1] + '&d=' + a[2] +
      '&hh=' + Math.floor(minutes / 60) + '&m1=' + Math.floor((minutes % 60) / 10) + '&m2=' + (minutes % 10) + '&type=1';
  }

  // ---- 予定の取り込み ----
  // 本人の予定は公開のファイルに入れない。別に渡す「取り込み用の文字」を貼り付けて、この端末の中だけに入れる。
  // 形：{ app: 'ichinichi-plans', plans: [...], days: { 'YYYY-MM-DD': { routineOff, dayType } } }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function minute(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v < 48 * 60 ? Math.round(v) : null; }
  function dayStr(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
  function cleanItems(list) { return (Array.isArray(list) ? list : []).slice(0, 50).map(function (c) { return { id: str(c && c.id, 40) || newId('c'), text: str(c && c.text, 200), done: !!(c && c.done) }; }).filter(function (c) { return c.text; }); }
  function cleanPlan(x) {
    if (!x || typeof x !== 'object' || !str(x.title, 200)) return null;
    var r = x.repeat || {};
    return {
      id: str(x.id, 60) || newId('p'), kind: KIND[x.kind] ? x.kind : 'other', title: str(x.title, 200), date: dayStr(x.date),
      time: minute(x.time), end: minute(x.end), dur: minute(x.dur), place: str(x.place, 200), address: str(x.address, 300), depart: minute(x.depart),
      departFrom: str(x.departFrom, 200), transport: TRANSPORT[x.transport] ? x.transport : '', memo: str(x.memo, 2000),
      items: (Array.isArray(x.items) ? x.items : []).slice(0, 50).map(function (v) { return str(v, 100); }).filter(Boolean),
      importance: [1, 2, 3, 4].indexOf(x.importance) >= 0 ? x.importance : 2, tentative: !!x.tentative, todo: !!x.todo,
      status: ['open', 'done', 'cancelled'].indexOf(x.status) >= 0 ? x.status : 'open',
      notify: x.notify && typeof x.notify === 'object' ? JSON.parse(JSON.stringify(x.notify)) : {}, wakeLead: minute(x.wakeLead) || undefined,
      tbdNote: str(x.tbdNote, 300) || undefined,
      checklist: cleanItems(x.checklist), confirm: cleanItems(x.confirm),
      legs: (Array.isArray(x.legs) ? x.legs : []).slice(0, 20).map(function (g) {
        return { id: str(g && g.id, 40) || newId('g'), from: str(g && g.from, 100), to: str(g && g.to, 100), name: str(g && g.name, 100), dep: minute(g && g.dep), arr: minute(g && g.arr),
          how: str(g && g.how, 300), move: minute(g && g.move) != null ? minute(g.move) : 10, verified: !!(g && g.verified) };
      }),
      repeat: { freq: ['none', 'daily', 'weekly', 'monthly'].indexOf(r.freq) >= 0 ? r.freq : 'none', days: (Array.isArray(r.days) ? r.days : []).filter(function (d) { return d >= 1 && d <= 7; }), until: dayStr(r.until) },
      doneDates: {}, skipDates: [], acks: {}, snoozes: [], createdAt: Date.now(), imported: true
    };
  }
  function parseBundle(text) {
    var o;
    try { o = JSON.parse(String(text || '').trim()); } catch (e) { return { error: '読み取れませんでした。取り込み用の文字を、最初から最後まで貼り付けてください。' }; }
    if (!o || o.app !== 'ichinichi-plans' || !Array.isArray(o.plans)) return { error: 'このアプリの予定の取り込み用の文字ではないようです。' };
    var plans = o.plans.slice(0, 300).map(cleanPlan).filter(Boolean), days = {};
    Object.keys(o.days || {}).slice(0, 400).forEach(function (k) { if (dayStr(k)) days[k] = { routineOff: !!o.days[k].routineOff, dayType: o.days[k].dayType === 'work' || o.days[k].dayType === 'off' ? o.days[k].dayType : null }; });
    return { plans: plans, days: days };
  }
  // data（アプリの記録）に入れる。同じ予定（同じ id）がすでにあれば、入れ直さない（本人が直した内容を残す）
  function importInto(data, bundle) {
    data.plans = data.plans || []; data.days = data.days || {};
    var added = 0, skipped = 0;
    bundle.plans.forEach(function (p) { if (data.plans.some(function (x) { return x.id === p.id; })) skipped++; else { data.plans.push(p); added++; } });
    Object.keys(bundle.days).forEach(function (k) {
      var cur = data.days[k] || L.newDay(k), b = bundle.days[k];
      if (b.routineOff) cur.routineOff = true;
      if (b.dayType && !cur.dayType) cur.dayType = b.dayType;
      data.days[k] = cur;
    });
    return { added: added, skipped: skipped };
  }

  // ---- 新しい予定のひな形 ----
  function blank(day, kind) {
    return { id: newId('p'), kind: kind || 'other', title: '', date: day || null, time: null, end: null, dur: null, place: '', address: '', depart: null,
      departFrom: '', transport: '', memo: '', items: [], importance: 2, tentative: false, todo: kind === 'todo', status: 'open', notify: {},
      checklist: [], confirm: [], legs: [], repeat: { freq: 'none' }, doneDates: {}, skipDates: [], acks: {}, snoozes: [], createdAt: Date.now() };
  }

  var api = {
    KINDS: KINDS, KIND: KIND, IMP: IMP, TRANSPORT: TRANSPORT, newId: newId, hm: hm,
    defaultNotify: defaultNotify, notifyOf: notifyOf, isRepeating: isRepeating, occursOn: occursOn, isDone: isDone, timesOf: timesOf, legTimes: legTimes,
    notices: notices, dayPlans: dayPlans, todosFor: todosFor, importantOpen: importantOpen, nextUp: nextUp, routineOf: routineOf, morning: morning,
    pushItems: pushItems, ics: ics, mapUrl: mapUrl, routeUrl: routeUrl, googleRouteUrl: googleRouteUrl, transitUrl: transitUrl,
    parseBundle: parseBundle, importInto: importInto, blank: blank, label: label
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DayPlans = api;
})(this);
