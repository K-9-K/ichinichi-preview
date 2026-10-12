/* 一日の流れ 試用版：計算部分。DayCore（Swift）と同じ手順で動かす。 */
(function (root) {
  'use strict';
  var H = 3600e3, MIN = 60e3, JST = 9 * H;

  // ---- 時刻（すべて Asia/Tokyo。日本には夏時間がないので +9時間で計算する） ----
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function parts(ms) {
    var d = new Date(ms + JST);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }
  function dayKey(ms) { var p = parts(ms); return p.y + '-' + pad(p.mo) + '-' + pad(p.d); }
  function dayStart(key) { var a = key.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]) - JST; }
  function addDays(key, n) { return dayKey(dayStart(key) + n * 24 * H + 12 * H); }
  function weekday(key) { var w = new Date(dayStart(key) + JST + 12 * H).getUTCDay(); return w === 0 ? 7 : w; }
  var WD = ['', '月', '火', '水', '木', '金', '土', '日'];
  function tod(h, m) { return h * 60 + m; }
  function todText(m) { return Math.floor(m / 60) + ':' + pad(m % 60); }
  function parseTod(s) { var a = String(s).split(':'); var h = +a[0], m = +a[1]; return (isNaN(h) || isNaN(m)) ? null : h * 60 + m; }
  function todOf(ms) { var p = parts(ms); return p.h * 60 + p.mi; }
  function dateAt(key, m) { return dayStart(key) + m * MIN; }
  function fmtTime(ms) { var p = parts(ms); return p.h + ':' + pad(p.mi); }
  function dayLabel(key) { var a = key.split('-').map(Number); return a[1] + '月' + a[2] + '日（' + WD[weekday(key)] + '）'; }
  function shortLabel(key) { var a = key.split('-').map(Number); return a[1] + '/' + a[2]; }
  function weekStart(key) { return addDays(key, -(weekday(key) - 1)); }
  function fmtDur(sec) {
    var s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    if (h > 0) return m > 0 ? h + '時間' + m + '分' : h + '時間';
    if (m > 0) return x > 0 ? m + '分' + x + '秒' : m + '分';
    return x + '秒';
  }
  function fmtMin(sec) {
    var m = Math.max(0, Math.round(sec / 60));
    if (m >= 60) return m % 60 === 0 ? (m / 60) + '時間' : Math.floor(m / 60) + '時間' + (m % 60) + '分';
    return m + '分';
  }
  function fmtClock(sec) {
    var s = Math.max(0, Math.ceil(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(x) : m + ':' + pad(x);
  }

  // ---- 設定の初期値 ----
  var ALL = [1, 2, 3, 4, 5, 6, 7], MON_SAT = [1, 2, 3, 4, 5, 6];
  var ORDER = ['wake', 'meditation', 'dressing', 'morningStudy1', 'breakfast', 'departurePrep', 'morningStudy2', 'departure',
    'extraStudy1', 'extraStudy2',
    'homecoming', 'workout', 'laundryCheck', 'bath', 'dinner', 'zumba',
    'afterZumba', 'nightSetup', 'nightStudy', 'nightStudy2', 'nightStudy3', 'reading', 'tomorrowPrep', 'bedtime'];
  // 夜の勉強の3つの部（理解・教科書 → 問題演習 → 間違い直し）
  var NIGHT_STEPS = ['nightStudy', 'nightStudy2', 'nightStudy3'];

  function st(h, m, dur, days, notify, channel) {
    return { time: tod(h, m), dur: dur, days: days.slice(), notify: notify, channel: channel || 'notification' };
  }

  var VIDEOS = [
    { id: '_FGRAvlWpkc', title: 'THIS 15 Min CARDIO WORKOUT is Perfect for AGILITY and ENDURANCE | BODYATTACK（Les Mills）', cat: 'bodyAttack', sec: 818, titleMin: 15, note: 'タイトルは15分だが実時間は13分38秒' },
    { id: 'GWcLgph55Ig', title: '10 Min High Energy Cardio Workout (All Levels) | BODYATTACK（Les Mills）', cat: 'bodyAttack', sec: 777, titleMin: 10, note: 'タイトルは10分だが実時間は12分57秒。高強度なので木曜は控えめに' },
    { id: 'DHOPWvO3ZcI', title: '10 MIN UPPER BODY WORKOUT - Back, Arms & Chest（Pamela Reif）', cat: 'upperBody', sec: 640, titleMin: 10, note: '' },
    { id: 'Bi1IRzJIoAo', title: 'Killer at Home Chest Workout - 10 Minute Chest Workout（FitnessBlender）', cat: 'chest', sec: 642, titleMin: 10, note: '' },
    { id: 'WGnCC4udvlw', title: '10 MIN BOOTY WORKOUT - NO JUMPS（Pamela Reif）', cat: 'glutes', sec: 644, titleMin: 10, note: '' },
    { id: 'C8X96ItgyOg', title: '10 Minute Butt and Thigh Workout At Home（FitnessBlender）', cat: 'glutesThighs', sec: 654, titleMin: 10, note: '' },
    { id: 'k13tLqxVYaY', title: '10 MIN GOOD MOOD ABS - very intense（Pamela Reif）', cat: 'abs', sec: 662, titleMin: 10, note: '本人の説明では「とてもきつい」腹筋' },
    { id: 'AnYl6Nk9GOA', title: '10 MIN AB WORKOUT // No Equipment（Pamela Reif）', cat: 'abs', sec: 626, titleMin: 10, note: '' }
  ];
  VIDEOS.forEach(function (v) { v.url = 'https://www.youtube.com/watch?v=' + v.id; });

  var CAT = {
    bodyAttack: 'BODYATTACK（全身の有酸素・高強度）', upperBody: '胸を含む上半身', chest: '胸', glutes: 'お尻',
    glutesThighs: 'お尻・太もも', abs: '腹筋', zumba: 'ZUMBA', other: 'その他'
  };
  var DAY_TYPE = { run: 'インターバル走＋軽い筋トレ', upperBody: 'BODYATTACK＋胸＋腹筋', fullBody: 'BODYATTACK＋全身＋腹筋（強度控えめ）', glutes: 'BODYATTACK＋お尻＋腹筋', rest: '休み' };
  var SHORT = { bodyAttack: 'BODYATTACK', upperBody: '上半身', chest: '胸', glutes: 'お尻', glutesThighs: 'お尻・太もも', abs: '腹筋' };

  // 2026-10-12：本人の「1週間の生活・学習スケジュール」（v4）に合わせた初期値
  function defaultSettings() {
    return {
      scheduleVersion: 4,
      steps: {
        wake: st(6, 0, 0, MON_SAT, true, 'alarm'),
        meditation: st(6, 0, 10, MON_SAT, true, 'alarm'),
        dressing: st(6, 10, 5, MON_SAT, false),
        morningStudy1: st(6, 15, 15, MON_SAT, false),
        breakfast: st(6, 30, 15, ALL, true),
        departurePrep: st(6, 45, 15, MON_SAT, true),
        morningStudy2: st(7, 0, 15, MON_SAT, false),
        departure: st(7, 15, 0, MON_SAT, true),
        extraStudy1: st(9, 0, 90, [6], true),
        extraStudy2: st(14, 0, 90, [6], true),
        homecoming: st(17, 30, 15, MON_SAT, true),
        workout: st(17, 45, 45, MON_SAT, false),
        laundryCheck: st(18, 30, 5, MON_SAT, true),
        bath: st(18, 35, 25, ALL, false),
        dinner: st(19, 0, 30, ALL, false),
        zumba: st(19, 30, 15, MON_SAT, true),
        afterZumba: st(19, 45, 5, [], true),
        nightSetup: st(20, 45, 15, MON_SAT, true),
        nightStudy: st(21, 0, 30, MON_SAT, false),
        nightStudy2: st(21, 30, 45, MON_SAT, true),
        nightStudy3: st(22, 15, 15, MON_SAT, true),
        reading: st(22, 30, 30, MON_SAT, true),
        tomorrowPrep: st(22, 25, 5, [], true),
        bedtime: st(23, 0, 0, ALL, true)
      },
      // 土曜の初期値：work = 出勤、off = 休み。その日ごとにホームで選び直せる
      satDefault: 'work',
      // 夜の勉強の科目（曜日ごと）：[21:00 理解・教科書, 21:30 問題演習, 22:15 間違い直し]
      nightPlan: {
        1: [{ subject: '消費税法', kind: '教科書' }, { subject: '財務諸表論', kind: '問題演習' }, { subject: '簿記論', kind: '間違い直し' }],
        2: [{ subject: '簿記論', kind: '理解' }, { subject: '消費税法', kind: '問題演習' }, { subject: '財務諸表論', kind: '間違い直し' }],
        3: [{ subject: '財務諸表論', kind: '教科書' }, { subject: '簿記論', kind: '問題演習' }, { subject: '消費税法', kind: '間違い直し' }],
        4: [{ subject: '消費税法', kind: '教科書' }, { subject: '財務諸表論', kind: '問題演習' }, { subject: '簿記論', kind: '間違い直し' }],
        5: [{ subject: '簿記論', kind: '理解' }, { subject: '消費税法', kind: '問題演習' }, { subject: '財務諸表論', kind: '間違い直し' }],
        6: [{ subject: '財務諸表論', kind: '教科書' }, { subject: '簿記論', kind: '問題演習' }, { subject: '消費税法', kind: '間違い直し' }]
      },
      wake: { followUp: true, interval: 2, count: 8 },
      // 押すまで鳴らし直す（interval 分おきに count 回）。起床は上の wake で決める
      repeat: {
        workout: { on: true, interval: 3, count: 5 },
        nightStudy: { on: true, interval: 2, count: 5 },
        tomorrowPrep: { on: true, interval: 3, count: 4 },
        bedtime: { on: false, interval: 5, count: 2 }
      },
      meditation: { extend: 10, endWithAlarm: true },
      study: { min: 5, max: 15, oneMinute: 60, confirm: { morning1: 30, morning2: 30, afterZumba: 120, night: 45, night2: 60, night3: 30, extra1: 120, extra2: 120, other: 150 } },
      laundry: { duration: 50, reNotify: 15 },
      nudges: [
        { id: 'n2040', time: tod(20, 40), text: '自由時間はあと5分。保存して終わろう', channel: 'notification', enabled: true },
        { id: 'n2055', time: tod(20, 55), text: 'あと5分で勉強。教材を開いておこう', channel: 'notification', enabled: true },
        { id: 'n2100', time: tod(21, 0), text: '最初の1ページを始めよう', channel: 'alarm', enabled: true }
      ],
      wrapUpNotify: true, departureWarn: 5, laterMinutes: 10,
      workout: {
        end: tod(18, 30),
        days: {
          1: { type: 'run' },
          2: { type: 'upperBody', main: '_FGRAvlWpkc', sub: 'Bi1IRzJIoAo', abs: 'AnYl6Nk9GOA', note: '' },
          3: { type: 'run' },
          4: { type: 'fullBody', main: 'GWcLgph55Ig', sub: null, abs: 'AnYl6Nk9GOA', note: '強度は控えめに。ジャンプは小さく、ペースを落としてよい' },
          5: { type: 'run' },
          6: { type: 'glutes', main: '_FGRAvlWpkc', sub: 'WGnCC4udvlw', abs: 'AnYl6Nk9GOA', note: '' },
          7: { type: 'rest' }
        },
        golf: { base: 10, min: 3, max: 15 }, prep: { base: 3, min: 2, max: 5 }, cooldown: { base: 3, min: 2, max: 5 },
        // 2本目の動画がある日は、2本目と腹筋をそれぞれこの分数までにして 18:30 に収める
        subCap: 6,
        // ランニングの日の「軽い筋トレ」（分）
        strength: { base: 6, min: 0, max: 8 },
        switchSec: 60, restMax: 5,
        interval: { jog: 180, fast: 30, slow: 60, baseSets: 10, minSets: 3, walk: 120 },
        partialMin: 5, unknownMin: 11
      },
      videos: VIDEOS.map(function (v) { return Object.assign({}, v); }),
      zumbaVideo: null
    };
  }

  // ---- 項目の中身（固定） ----
  function I(title, guidance, checklist, group, route, chainEarly, lead, expiry, study, exercise) {
    return { title: title, guidance: guidance, checklist: checklist, group: group, route: route, chainEarly: chainEarly, lead: lead, expiry: expiry, study: !!study, exercise: !!exercise };
  }
  var INFO = {
    wake: I('カーテンを開けよう', '起きたら、まずカーテンを開けて部屋を明るくしよう', [], 'morning', 'curtain', false, 0, { atStep: 'breakfast' }),
    meditation: I('寝た姿勢で瞑想', '横になったまま、音を聞きながらゆっくり呼吸しよう', [], 'morning', 'meditation', true, 0, { afterEnd: 10 }),
    dressing: I('水を飲む', 'トイレと口すすぎを済ませて、水を1杯飲もう', ['トイレ', '口をゆすぐ', '水を飲む'], 'morning', 'checklist.dressing', true, 0, { atStep: 'breakfast' }),
    morningStudy1: I('朝の復習①', '科目を選んで「開始」だけでOK。15分', [], 'morning', 'study.morning1', true, 0, { atStep: 'breakfast' }, true),
    breakfast: I('朝食', '朝食をとろう', [], 'morning', 'step.breakfast', true, 0, { atStep: 'departurePrep' }),
    departurePrep: I('歯磨き・身支度', '歯磨きと着替えを済ませよう。終わったら机へ', ['歯磨き', 'シャツに着替える', '掛けてあるズボンをはく'], 'morning', 'checklist.departurePrep', true, 0, { atStep: 'departure' }),
    morningStudy2: I('朝の復習②', '机に座って15分。①の続きから始められます', [], 'morning', 'study.morning2', true, 0, { atStep: 'departure' }, true),
    departure: I('通勤', '勉強を保存して、出発しよう', [], 'morning', 'step.departure', false, 'departureWarn', { afterEnd: 30 }),
    extraStudy1: I('追加学習（午前）', '科目を選んで「開始」。10:30 まで', [], 'day', 'study.extra1', false, 0, { afterEnd: 60 }, true),
    extraStudy2: I('追加学習（午後）', '科目を選んで「開始」。15:30 まで', [], 'day', 'study.extra2', false, 0, { afterEnd: 60 }, true),
    homecoming: I('帰宅したら', '2階玄関から入って、運動用の服に着替えよう', ['2階玄関から入る', 'ズボンを脱いで掛ける', '着ていたシャツを洗濯かごへ', '運動用の服に着替える', 'iPadを持って2階のジムへ'], 'evening', 'checklist.homecoming', false, 30, { workoutEnd: true }),
    workout: I('運動', 'ジムに着いたら「運動開始」。ゴルフから始めて、終了時刻までに収まるプランを作ります', [], 'evening', 'workout', true, 0, { workoutEnd: true }, false, true),
    laundryCheck: I('洗濯かごの確認', '洗濯かごはいっぱい？', [], 'evening', 'laundry', true, 0, { atStep: 'zumba' }),
    bath: I('入浴', '夕食までに出よう', [], 'evening', 'step.bath', true, 0, { afterEnd: 20 }),
    dinner: I('夕食', '夕食の時間です', [], 'evening', 'step.dinner', true, 0, { atStep: 'zumba' }),
    zumba: I('ZUMBA', '15分。終わったら自由時間', [], 'evening', 'step.zumba', false, 10, { afterEnd: 20 }, false, true),
    afterZumba: I('まず机に座ろう', '1分だけ勉強を始めよう', [], 'night', 'oneMinute', true, 0, { firstNudge: true }, true),
    nightSetup: I('机へ・教材準備', '机に座って、今日の教材を開いておこう', ['教科書', '問題集・答案用紙', '電卓・ペン', '最初のページを開いておく'], 'night', 'checklist.nightSetup', false, 0, { atStep: 'nightStudy' }),
    nightStudy: I('夜の勉強① 理解・教科書', '教科書を開いて、最初の1ページを始めよう', [], 'night', 'study.night', false, 5, { atStep: 'nightStudy2' }, true),
    nightStudy2: I('夜の勉強② 問題演習', '問題演習に切り替えよう。最初の1問から', [], 'night', 'study.night2', true, 0, { atStep: 'nightStudy3' }, true),
    nightStudy3: I('夜の勉強③ 間違い直し', '間違えた問題を直そう', [], 'night', 'study.night3', true, 0, { atStep: 'reading' }, true),
    reading: I('読書', '財表の本 → 疲れたら小説 → 娯楽なら漫画', [], 'night', 'step.reading', true, 0, { atStep: 'bedtime' }),
    tomorrowPrep: I('翌朝の準備', '準備したら電子機器を閉じよう', ['翌朝の教材', '服', '持ち物', '目覚まし（iPadの充電・音量）'], 'night', 'checklist.tomorrowPrep', true, 0, { atStep: 'bedtime' }),
    bedtime: I('就寝', 'ベッドに入ろう。アプリは開かなくて大丈夫', [], 'night', 'step.bedtime', false, 0, { afterEnd: 90 })
  };
  // 出勤の日だけ・土曜の休みの日だけに出す項目
  INFO.departure.only = 'work'; INFO.homecoming.only = 'work';
  INFO.extraStudy1.only = 'off'; INFO.extraStudy2.only = 'off';

  // その日の種類：work = 出勤（月〜金と、出勤の土曜）、off = 土曜の休み、rest = 日曜
  function dayKind(wd, s, ds) { return wd === 7 ? 'rest' : wd === 6 ? ((ds && ds.dayType) || s.satDefault || 'work') : 'work'; }
  // その日にその項目を出すか
  function stepOn(id, s, wd, ds) {
    var set = s.steps[id], only = INFO[id].only;
    return !!set && set.days.indexOf(wd) >= 0 && (!only || only === dayKind(wd, s, ds));
  }
  // 夜の勉強の、その曜日・その部の科目
  function nightPart(s, wd, id) {
    var i = NIGHT_STEPS.indexOf(id), p = s.nightPlan && s.nightPlan[wd];
    return i >= 0 && p && p[i] && p[i].subject ? p[i] : null;
  }
  // 画面と通知に出す名前。夜の勉強は「消費税法・教科書」のように科目を出す
  function stepTitle(id, s, wd) { var np = nightPart(s, wd, id); return np ? np.subject + '・' + np.kind : INFO[id].title; }

  function firstNudge(s) {
    var t = s.nudges.filter(function (n) { return n.enabled; }).map(function (n) { return n.time; });
    return t.length ? Math.min.apply(null, t) : s.steps.nightStudy.time;
  }

  // ---- その日の状態 ----
  function newDay(key) { return { day: key, steps: {}, meditation: null, workout: null, nightStudyStartedAt: null, dayType: null, events: [] }; }
  function rec(ds, id) { return ds.steps[id] || { status: 'pending', at: null, laterUntil: null, laterCount: 0, checks: [], method: null }; }
  function upd(ds, id, f) { var r = JSON.parse(JSON.stringify(rec(ds, id))); f(r); ds.steps[id] = r; }
  function log(ds, text, t) { ds.events.push({ at: t, text: text }); if (ds.events.length > 300) ds.events.splice(0, ds.events.length - 300); }
  function complete(ds, id, t, method) {
    upd(ds, id, function (r) { r.status = 'done'; r.at = t; r.laterUntil = null; if (method) r.method = method; });
    log(ds, INFO[id].title + '：完了', t);
  }
  function skip(ds, id, t) {
    upd(ds, id, function (r) { r.status = 'skipped'; r.at = t; r.laterUntil = null; });
    log(ds, INFO[id].title + '：今日は省略', t);
  }
  function later(ds, id, t, minutes) {
    upd(ds, id, function (r) { r.laterUntil = t + minutes * MIN; r.laterCount++; });
    log(ds, INFO[id].title + '：あとで（' + minutes + '分後）', t);
  }
  function reopen(ds, id, t) {
    upd(ds, id, function (r) { r.status = 'pending'; r.at = null; r.laterUntil = null; });
    log(ds, INFO[id].title + '：未実施に戻した', t);
  }
  function finished(ds, id) { return rec(ds, id).status !== 'pending'; }

  // ---- 一日の流れ ----
  function resolve(day, s, ds) {
    var wd = weekday(day);
    var enabled = ORDER.filter(function (id) { return stepOn(id, s, wd, ds); });
    var on = {}; enabled.forEach(function (id) { on[id] = true; });
    var out = [], last = {};
    enabled.forEach(function (id) {
      var set = s.steps[id], info = INFO[id];
      var start = dateAt(day, set.time), end = start + set.dur * MIN;
      var lead = info.lead === 'departureWarn' ? s.departureWarn
        : info.lead === 'firstNudge' ? Math.max(0, set.time - firstNudge(s)) : info.lead;
      var available = start - lead * MIN;
      var fallback = end + 30 * MIN, expires, ex = info.expiry, t;
      if (ex.atStep) { t = on[ex.atStep] ? dateAt(day, s.steps[ex.atStep].time) : 0; expires = t > start ? t : fallback; }
      else if (ex.afterEnd != null) { var extra = ex.afterEnd; if (id === 'meditation') extra = Math.max(extra, s.meditation.extend); expires = end + extra * MIN; }
      else if (ex.workoutEnd) { t = dateAt(day, s.workout.end); expires = t > start ? t : fallback; }
      else { t = dateAt(day, firstNudge(s)); expires = t > start ? t : fallback; }
      if (expires <= available) expires = fallback;
      var r = rec(ds, id), prev = last[info.group];
      if (info.chainEarly && prev && prev.rec.status !== 'pending' && prev.rec.at != null) available = Math.min(available, prev.rec.at);
      var step = { id: id, title: stepTitle(id, s, wd), guidance: info.guidance, checklist: info.checklist, route: info.route, setting: set,
        start: start, end: end, available: available, expires: expires, rec: r };
      out.push(step); last[info.group] = step;
    });
    return out;
  }

  // 一覧に出す状態。時刻がまだ来ていない項目は「これから」、過ぎたものだけ「未実施」
  function phase(step, t) {
    var r = step.rec;
    if (r.status === 'done') return 'done';
    if (r.status === 'skipped') return 'skipped';
    if (t >= step.expires) return 'missed';
    if (r.laterUntil != null && r.laterUntil > t) return 'later';
    if (t < step.available) return 'upcoming';
    return 'now';
  }

  function snapshot(t, s, ds, active) {
    active = active || {};
    var steps = resolve(ds.day, s, ds);
    var pending = steps.filter(function (x) { return x.rec.status === 'pending'; });
    function snoozed(x) { return x.rec.laterUntil != null && x.rec.laterUntil > t; }
    var current = null, i;
    for (i = 0; i < pending.length; i++) if (active[pending[i].id]) { current = pending[i]; break; }
    if (!current) for (i = 0; i < pending.length; i++) {
      var p = pending[i];
      if (p.available <= t && t < p.expires && !snoozed(p)) { current = p; break; }
    }
    var next = null;
    if (current) {
      var co = ORDER.indexOf(current.id);
      for (i = 0; i < pending.length; i++) if (ORDER.indexOf(pending[i].id) > co && pending[i].expires > t) { next = pending[i]; break; }
    } else {
      var best = Infinity;
      pending.forEach(function (x) {
        if (x.expires <= t) return;
        var nt = snoozed(x) ? x.rec.laterUntil : Math.max(x.available, t);
        if (nt < best) { best = nt; next = x; }
      });
    }
    var rest = !steps.some(function (x) { return INFO[x.id].study || INFO[x.id].exercise; });
    var idle = null;
    if (!current) {
      if (next) {
        if ((next.id === 'nightSetup' || next.id === 'nightStudy') && !snoozed(next)) idle = '自由時間（' + fmtTime(Math.max(next.available, t)) + 'まで）';
        else if (next.id === 'bedtime') idle = fmtTime(next.start) + ' にはベッドに入ろう';
        else if (snoozed(next)) idle = '「' + next.title + '」はあとで（' + fmtTime(next.rec.laterUntil) + 'にもう一度）';
        else idle = '次の予定まで自由に過ごせます';
      } else idle = '今日の予定はおしまい。おつかれさまでした';
    }
    return { current: current, next: next, idle: idle, steps: steps, rest: rest };
  }

  // ---- 運動プラン ----
  function makeBlocks(s, wd, videos) {
    var w = s.workout, day = w.days[wd] || { type: 'rest' };
    if (day.type === 'rest') return [];
    var list = [];
    list.push({ id: 'golf', kind: 'golf', title: 'ゴルフ', note: '', base: w.golf.base * 60, min: w.golf.min * 60, max: w.golf.max * 60, partial: 0 });
    list.push({ id: 'prep', kind: 'prep', title: day.type === 'run' ? 'ランニング準備' : '準備運動', note: '', base: w.prep.base * 60, min: w.prep.min * 60, max: w.prep.max * 60, partial: 0 });
    var partial = w.partialMin * 60;
    // cap = この動画に使う秒数の上限（0 なら最後まで）。full = 動画そのものの長さ
    function vb(id, vid, fallback, aux, cap) {
      var v = null; videos.forEach(function (x) { if (x.id === vid) v = x; });
      var full = (v && v.sec) || w.unknownMin * 60, secs = cap ? Math.min(full, cap) : full;
      var title = v ? (id === 'abs' ? '腹筋' : id === 'sub' ? (SHORT[v.cat] || fallback) : (v.cat === 'bodyAttack' ? 'BODYATTACK' : fallback)) : fallback + '（動画未設定）';
      var note = v ? (v.note || '') : '';
      if (!aux && day.note) note = day.note;
      return { id: id, kind: 'video', title: title, note: note, url: v ? v.url : null, lengthKnown: !!(v && v.sec), aux: aux,
        high: !!(v && v.cat === 'bodyAttack'), base: secs, full: full, min: 0, max: secs, partial: Math.min(partial, secs) };
    }
    if (day.type === 'run') {
      var iv = w.interval;
      list.push({ id: 'run', kind: 'interval', title: 'インターバルラン', note: '', high: true, iv: JSON.parse(JSON.stringify(iv)),
        base: iv.jog + iv.baseSets * (iv.fast + iv.slow) + iv.walk, min: 0, max: 0, partial: 0 });
      var sg = w.strength;
      if (sg && sg.base > 0) list.push({ id: 'strength', kind: 'strength', title: '軽い筋トレ', note: '無理のない回数で', base: sg.base * 60, min: sg.min * 60, max: sg.max * 60, partial: sg.min * 60 });
    } else {
      var fb = day.type === 'upperBody' ? '上半身（胸を含む）' : day.type === 'fullBody' ? '全身運動' : 'お尻';
      var cap = day.sub && w.subCap ? w.subCap * 60 : 0;
      list.push(vb('main', day.main, fb, false, 0));
      if (day.sub) list.push(vb('sub', day.sub, '2本目', true, cap));
      list.push(vb('abs', day.abs, '腹筋', true, cap));
    }
    list.push({ id: 'cooldown', kind: 'cooldown', title: '整理運動', note: '', base: w.cooldown.base * 60, min: w.cooldown.min * 60, max: w.cooldown.max * 60, partial: 0 });
    return list;
  }

  function planWorkout(blocks, now, end, switchSec, restMax) {
    var avail = Math.max(0, Math.floor((end - now) / 1000));
    var items = [];
    blocks.forEach(function (bs) {
      if (bs.status !== 'pending') return;
      var b = bs.block;
      if (b.kind === 'interval') {
        var iv = b.iv, setsBase = Math.max(0, iv.baseSets - bs.setsDone);
        if (bs.setsCap != null) setsBase = Math.min(setsBase, Math.max(0, bs.setsCap - bs.setsDone));
        if (bs.walkDone > 0) setsBase = 0;
        var it = { bs: bs, kind: 'interval', secs: 0, base: 0, minS: 0, maxS: 0, partial: 0,
          jog: Math.max(0, iv.jog - bs.jogDone), walk: Math.max(0, iv.walk - bs.walkDone), sets: setsBase, baseSets: setsBase,
          setsMin: Math.min(setsBase, Math.max(0, iv.minSets - bs.setsDone)) };
        if (dur(it) > 0) items.push(it);
      } else {
        var done = bs.doneSeconds, base = Math.max(0, b.base - done);
        if (base <= 0) return;
        items.push({ bs: bs, kind: b.kind, secs: base, base: base, minS: Math.min(base, Math.max(0, b.min - done)),
          maxS: Math.max(base, b.max - done), partial: Math.min(base, Math.max(0, b.partial - done)), jog: 0, walk: 0, sets: 0, baseSets: 0, setsMin: 0 });
      }
    });
    function dur(it) { return it.kind === 'interval' ? it.jog + it.sets * (it.bs.block.iv.fast + it.bs.block.iv.slow) + it.walk : it.secs; }
    function total() { return items.reduce(function (a, it) { return a + dur(it) + (it.kind === 'video' && dur(it) > 0 ? switchSec : 0); }, 0); }
    function deficit() { return total() - avail; }
    function shrink(pred, target) {
      for (var i = 0; i < items.length; i++) {
        if (!pred(items[i])) continue;
        var d = deficit(); if (d <= 0) return;
        if (items[i].kind === 'interval') {
          var t = target(items[i]);
          while (items[i].sets > t && deficit() > 0) items[i].sets--;
        } else {
          var can = items[i].secs - target(items[i]);
          if (can <= 0) continue;
          items[i].secs -= Math.min(can, Math.ceil(d / 60) * 60);
        }
      }
    }
    function drop(pred) {
      items.forEach(function (it) {
        if (pred(it) && deficit() > 0) { it.secs = 0; if (it.kind === 'interval') { it.sets = 0; it.jog = 0; it.walk = 0; } }
      });
    }
    var isGolf = function (x) { return x.kind === 'golf'; };
    var isAux = function (x) { return (x.kind === 'video' && x.bs.block.aux) || x.kind === 'strength'; };
    var isMain = function (x) { return x.kind === 'video' && !x.bs.block.aux; };
    var isIv = function (x) { return x.kind === 'interval'; };
    var isPrep = function (x) { return x.kind === 'prep'; };
    var isCool = function (x) { return x.kind === 'cooldown'; };
    if (deficit() > 0) {
      // 削る順番：ゴルフ → 補助運動 → インターバルのセット数 → … 準備・整理運動は最後
      shrink(isGolf, function (x) { return x.minS; });
      shrink(isAux, function (x) { return x.partial; });
      shrink(isIv, function (x) { return x.setsMin; });
      drop(isAux);
      shrink(isGolf, function () { return 0; });
      shrink(isMain, function (x) { return x.partial; });
      shrink(isIv, function () { return 0; });
      drop(isMain);
      drop(isIv);
      shrink(isPrep, function (x) { return x.minS; });
      shrink(isCool, function (x) { return x.minS; });
      drop(isPrep);
      shrink(isCool, function () { return 0; });
    }
    var extra = Math.max(0, avail - total());
    function grow(pred) {
      items.forEach(function (it) {
        if (!pred(it) || it.secs <= 0) return;
        var add = Math.floor(Math.min(it.maxS - it.secs, extra) / 60) * 60;
        if (add > 0) { it.secs += add; extra -= add; }
      });
    }
    grow(isGolf); grow(isPrep); grow(isCool);
    var rest = Math.min(Math.floor(extra / 60) * 60, restMax);
    extra -= rest;
    var spare = extra;

    // 動画そのものの残りの長さ（上限をかけた動画は、これより短くなる）
    function fullLeft(it) { var b = it.bs.block; return Math.max(0, (b.full || b.base) - it.bs.doneSeconds); }
    var notes = [];
    items.forEach(function (it) {
      var title = it.bs.block.title;
      if (it.kind === 'interval') {
        if (it.sets < it.baseSets) notes.push(it.sets === 0 ? 'インターバルは今日はなし（ジョグ・歩行' + (dur(it) > 0 ? 'のみ' : 'もなし') + '）' : 'インターバル ' + it.baseSets + '→' + it.sets + 'セット');
      } else if (it.secs === 0) notes.push(title + 'は今日は省略');
      else if (it.kind === 'video' && it.secs < fullLeft(it)) notes.push(title + 'は最初の' + fmtMin(it.secs) + 'だけ');
      else if (it.secs < it.base) notes.push(title + ' ' + fmtMin(it.base) + '→' + fmtMin(it.secs));
      else if (it.secs > it.base) notes.push(title + ' +' + fmtMin(it.secs - it.base) + '（余裕のため）');
    });
    if (rest > 0) notes.push('休憩・水分補給 ' + fmtMin(rest));
    if (spare >= 60) notes.push('ゆとり ' + fmtMin(spare) + '（早く終えてよい）');
    if (avail < 60) notes.push('終了時刻を過ぎています。今日はここまでにしよう');

    var segs = [], t = now, n = 0;
    function add(blockID, kind, title, detail, secs, url, high) {
      if (secs <= 0) return;
      var e = t + secs * 1000; n++;
      segs.push({ id: blockID + '#' + n, blockID: blockID, kind: kind, title: title, detail: detail, start: t, end: e, url: url || null, high: !!high });
      t = e;
    }
    var restPlaced = false;
    items.forEach(function (it) {
      if (dur(it) <= 0) return;
      var b = it.bs.block;
      if (it.kind === 'golf' || it.kind === 'prep') add(b.id, it.kind, b.title, b.note, it.secs);
      else if (it.kind === 'video') {
        add(b.id, 'switchVideo', '動画の切り替え', '次：' + b.title, switchSec, b.url);
        var detail = it.secs < fullLeft(it) ? '動画の最初の' + fmtDur(it.secs) + 'まで'
          : !b.lengthKnown ? '動画の長さ未確認（仮に' + fmtMin(it.secs) + '）' : '動画 ' + fmtDur(it.secs) + '（実時間）';
        if (b.note) detail += '／' + b.note;
        add(b.id, 'video', b.title, detail, it.secs, b.url, b.high);
      } else if (it.kind === 'interval') {
        var iv = b.iv;
        add(b.id, 'jog', '軽いジョグ', 'ゆっくり体を温める', it.jog);
        for (var k = 0; k < it.sets; k++) {
          add(b.id, 'fast', '速く（' + (k + 1) + '/' + it.sets + '）', '自分で決めた速さで。全力疾走はしない', iv.fast, null, true);
          add(b.id, 'slow', 'ゆっくり（' + (k + 1) + '/' + it.sets + '）', '呼吸を整える', iv.slow);
        }
        add(b.id, 'walk', 'ジョグ〜歩行', 'だんだんゆっくりに', it.walk);
      } else if (it.kind === 'strength') add(b.id, 'strength', b.title, b.note, it.secs);
      else if (it.kind === 'cooldown') {
        if (rest > 0) { add('rest', 'rest', '休憩・水分補給', '', rest); restPlaced = true; }
        add(b.id, 'cooldown', b.title, b.note, it.secs);
      }
    });
    if (rest > 0 && !restPlaced) add('rest', 'rest', '休憩・水分補給', '', rest);
    if (spare > 0) add('spare', 'spare', spare >= 60 ? 'ゆとり' : '終了まで', '早く終えてもよい', spare);
    var ivItem = null; items.forEach(function (it) { if (it.kind === 'interval') ivItem = it; });
    return { createdAt: now, end: end, segments: segs, notes: notes,
      setsPlanned: ivItem ? ivItem.sets : null, setsDoneBefore: ivItem ? ivItem.bs.setsDone : null };
  }

  // 運動の進行（DayCore の WorkoutSession と同じ）
  function startWorkout(day, now, s) {
    var blocks = makeBlocks(s, weekday(day), s.videos).map(function (b) {
      return { block: b, status: 'pending', doneSeconds: 0, jogDone: 0, setsDone: 0, walkDone: 0, setsCap: null };
    });
    var w = { day: day, type: (s.workout.days[weekday(day)] || { type: 'rest' }).type, startedAt: now, end: dateAt(day, s.workout.end),
      blocks: blocks, plan: null, pausedAt: null, pausedBlockID: null, pausedKind: null, finishedAt: null,
      switchSec: s.workout.switchSec, restMax: s.workout.restMax * 60 };
    replan(w, now);
    return w;
  }
  function replan(w, now) { w.plan = planWorkout(w.blocks, now, w.end, w.switchSec, w.restMax); }
  function isPaused(w) { return w.pausedAt != null && w.finishedAt == null; }
  function isFinished(w) { return w.finishedAt != null; }
  function segIndex(w, now) {
    if (isFinished(w) || isPaused(w) || !w.plan) return -1;
    for (var i = 0; i < w.plan.segments.length; i++) { var g = w.plan.segments[i]; if (g.start <= now && now < g.end) return i; }
    return -1;
  }
  function currentSeg(w, now) { var i = segIndex(w, now); return i >= 0 ? w.plan.segments[i] : null; }
  function nextBlockSeg(w, now) {
    var i = segIndex(w, now); if (i < 0) return null;
    var cur = w.plan.segments[i], rest = w.plan.segments.slice(i + 1);
    for (var k = 0; k < rest.length; k++) if (rest[k].blockID !== cur.blockID && rest[k].kind !== 'switchVideo') return rest[k];
    for (k = 0; k < rest.length; k++) if (rest[k].blockID !== cur.blockID) return rest[k];
    return null;
  }
  function blockOf(w, id) { for (var i = 0; i < w.blocks.length; i++) if (w.blocks[i].block.id === id) return w.blocks[i]; return null; }
  function commit(w, t) {
    var plan = w.plan; if (!plan) return;
    var touched = {};
    plan.segments.forEach(function (g) {
      if (g.start >= t) return;
      var ov = Math.floor((Math.min(t, g.end) - g.start) / 1000), b = blockOf(w, g.blockID);
      if (ov <= 0 || !b) return;
      touched[g.blockID] = true;
      if (g.kind === 'jog') b.jogDone += ov;
      else if (g.kind === 'slow') { if (g.end <= t) b.setsDone += 1; }
      else if (g.kind === 'walk') b.walkDone += ov;
      else if (g.kind === 'golf' || g.kind === 'prep' || g.kind === 'video' || g.kind === 'cooldown' || g.kind === 'strength') b.doneSeconds += ov;
    });
    Object.keys(touched).forEach(function (id) {
      var segs = plan.segments.filter(function (g) { return g.blockID === id && g.kind !== 'switchVideo'; });
      var b = blockOf(w, id);
      if (segs.length && segs[segs.length - 1].end <= t && b && b.status === 'pending') b.status = 'done';
    });
    if (plan.setsPlanned != null) {
      w.blocks.forEach(function (b) {
        if (b.block.kind !== 'interval') return;
        var cap = (plan.setsDoneBefore || 0) + plan.setsPlanned;
        b.setsCap = b.setsCap == null ? cap : Math.min(b.setsCap, cap);
      });
    }
    w.plan = null;
  }
  function pauseWorkout(w, now) {
    if (isFinished(w) || isPaused(w)) return;
    var g = currentSeg(w, now);
    if (g) { w.pausedBlockID = g.blockID; w.pausedKind = g.kind; }
    w.pausedAt = now; commit(w, now);
  }
  function resumeWorkout(w, now) {
    if (isFinished(w) || !isPaused(w)) return;
    w.pausedAt = null; w.pausedBlockID = null; w.pausedKind = null;
    if (now >= w.end) { finishWorkout(w, now); return; }
    replan(w, now);
  }
  function advance(w, now, status) {
    if (isFinished(w)) return;
    var paused = isPaused(w), id, kind;
    if (paused) { if (!w.pausedBlockID) return; id = w.pausedBlockID; kind = w.pausedKind; w.pausedBlockID = null; w.pausedKind = null; }
    else { var g = currentSeg(w, now); if (!g) return; id = g.blockID; kind = g.kind; commit(w, now); }
    if (kind === 'rest') w.restMax = 0;
    else if (kind === 'spare') { finishWorkout(w, now); return; }
    else { var b = blockOf(w, id); if (b && b.status === 'pending') b.status = status; }
    if (paused) return;
    if (now >= w.end) { finishWorkout(w, now); return; }
    replan(w, now);
  }
  function refreshWorkout(w, now) {
    if (isFinished(w)) return false;
    if (now >= w.end) { finishWorkout(w, w.end); return true; }
    if (w.plan && w.plan.segments.length && now >= w.plan.segments[w.plan.segments.length - 1].end) {
      finishWorkout(w, w.plan.segments[w.plan.segments.length - 1].end); return true;
    }
    return false;
  }
  function finishWorkout(w, now) {
    if (isFinished(w)) return;
    if (!isPaused(w)) commit(w, Math.min(now, w.end));
    w.finishedAt = Math.min(now, w.end); w.pausedAt = null;
    w.blocks.forEach(function (b) { if (b.status === 'pending' && b.doneSeconds === 0 && b.jogDone === 0 && b.setsDone === 0) b.status = 'skipped'; });
  }
  function workoutSummary(w) {
    return w.blocks.map(function (b) {
      var mark = b.status === 'done' ? '済' : b.status === 'skipped' ? '省略' : '途中';
      return b.block.kind === 'interval' ? b.block.title + '：' + b.setsDone + 'セット（' + mark + '）' : b.block.title + '：' + fmtMin(b.doneSeconds) + '（' + mark + '）';
    });
  }

  // ---- 勉強 ----
  var SLOT = { morning1: '朝の復習①', morning2: '朝の復習②', extra1: '追加（午前）', extra2: '追加（午後）', afterZumba: 'ZUMBA後',
    night: '夜① 理解', night2: '夜② 演習', night3: '夜③ 直し', other: 'その他' };
  var SLOT_STEP = { morning1: 'morningStudy1', morning2: 'morningStudy2', extra1: 'extraStudy1', extra2: 'extraStudy2', afterZumba: 'afterZumba',
    night: 'nightStudy', night2: 'nightStudy2', night3: 'nightStudy3' };
  // 止め忘れを疑うまでの分数。設定に無い区分は、ここの値を使う
  var CONFIRM = { morning1: 30, morning2: 30, afterZumba: 120, night: 45, night2: 60, night3: 30, extra1: 120, extra2: 120, other: 150 };
  function confirmMin(s, slot) { return (s.study.confirm && s.study.confirm[slot]) || CONFIRM[slot] || 150; }
  function sessionState(x) { if (x.endedAt != null) return 'finished'; var l = x.pauses[x.pauses.length - 1]; return l && l.end == null ? 'paused' : 'running'; }
  function activeSec(x, now) {
    var stop = x.endedAt != null ? x.endedAt : now, total = stop - x.startedAt;
    x.pauses.forEach(function (p) { total -= Math.max(0, Math.min(p.end != null ? p.end : stop, stop) - p.start); });
    return Math.max(0, total / 1000);
  }
  function needsConfirm(x, now, s) {
    if (x.endedAt != null) return false;
    if (dayKey(now) !== x.day) return true;
    return activeSec(x, now) > confirmMin(s, x.slot) * 60;
  }
  // 計測中の勉強のうち、「今すること」に出し続けてよい項目。止め忘れの疑いがある計測は入れない
  function activeStudySteps(sessions, day, now, s, stillStudying) {
    var a = {};
    sessions.forEach(function (x) {
      if (x.endedAt != null || x.day !== day || !SLOT_STEP[x.slot]) return;
      if (needsConfirm(x, now, s) && !stillStudying) return;
      a[SLOT_STEP[x.slot]] = true;
    });
    return a;
  }
  function suggestedEnd(x, s) {
    var limitEnd = x.startedAt + confirmMin(s, x.slot) * MIN, planned = null, own = s.steps[SLOT_STEP[x.slot]];
    if (x.slot === 'morning1') planned = dateAt(x.day, s.steps.breakfast.time);
    else if (x.slot === 'morning2') planned = dateAt(x.day, s.steps.departure.time);
    else if (own && x.slot !== 'afterZumba') planned = dateAt(x.day, own.time + own.dur);
    return planned != null && planned > x.startedAt ? Math.min(planned, limitEnd) : limitEnd;
  }
  var PRAISE = ['1分できた。今日も机に戻れたね', '1分できた。始められたのがいちばん大事', '1分できた。机に座れた、それで十分', '1分できた。今日もちゃんと戻ってこられたね'];
  function praise(day) { var a = day.split('-').map(Number); return PRAISE[(a[2] + a[1]) % PRAISE.length]; }
  function dayTotals(day, sessions) {
    var t = { bySlot: {}, total: 0, count: 0 };
    sessions.forEach(function (x) {
      if (x.endedAt == null || x.day !== day) return;
      var sec = activeSec(x, x.endedAt);
      t.bySlot[x.slot] = (t.bySlot[x.slot] || 0) + sec; t.total += sec; t.count++;
    });
    t.morning = (t.bySlot.morning1 || 0) + (t.bySlot.morning2 || 0);
    t.night = (t.bySlot.night || 0) + (t.bySlot.night2 || 0) + (t.bySlot.night3 || 0);
    return t;
  }
  function weekTotals(day, sessions) {
    var s0 = weekStart(day), out = [];
    for (var i = 0; i < 7; i++) { var d = addDays(s0, i); out.push({ day: d, sec: dayTotals(d, sessions).total }); }
    return out;
  }
  function bySubject(from, to, sessions) {
    var m = {};
    sessions.forEach(function (x) {
      if (x.endedAt == null || x.day < from || x.day > to) return;
      var k = x.subject || '（科目なし）'; m[k] = (m[k] || 0) + activeSec(x, x.endedAt);
    });
    return Object.keys(m).map(function (k) { return { name: k, sec: m[k] }; }).sort(function (a, b) { return b.sec - a.sec || (a.name < b.name ? -1 : 1); });
  }
  // 前回の続き。subject を渡すと、その科目の直近の記録を返す（夜の勉強は科目が決まっているため）
  function continuation(slot, day, sessions, subject) {
    var done = sessions.filter(function (x) { return x.endedAt != null && (!subject || x.subject === subject); }).sort(function (a, b) { return b.startedAt - a.startedAt; });
    if (slot === 'morning2') { for (var i = 0; i < done.length; i++) if (done[i].day === day && done[i].slot === 'morning1') return done[i]; }
    return done[0] || null;
  }

  // ---- 洗濯 ----
  function newLaundry() { return { day: null, phase: 'unknown', startedAt: null, expectedEnd: null, remindAt: null, hungAt: null }; }
  function laundryStart(l, now, minutes) { Object.assign(l, { day: dayKey(now), phase: 'washing', startedAt: now, expectedEnd: now + minutes * MIN, remindAt: null, hungAt: null }); }
  function laundrySkip(l, now) { Object.assign(l, { day: dayKey(now), phase: 'notWashing', startedAt: null, expectedEnd: null, remindAt: null, hungAt: null }); }
  function laundryNotYet(l, now, minutes) { if (l.phase === 'washing') l.remindAt = now + minutes * MIN; }
  function laundryHang(l, now) { if (l.phase === 'washing') { l.phase = 'hung'; l.hungAt = now; l.remindAt = null; } }
  function laundryClose(l) { Object.assign(l, newLaundry()); }
  function laundryReminder(l) { return l.phase === 'washing' ? (l.remindAt != null ? l.remindAt : l.expectedEnd) : null; }
  function laundryDecided(l, today) { if (l.day !== today) return l.phase === 'washing'; return l.phase !== 'unknown'; }
  function laundryStatus(l, now) {
    var today = dayKey(now);
    if (l.phase === 'washing') {
      if (l.day && l.day < today) return { kind: 'leftover', label: '前の日の洗濯が「干した」になっていません', active: true };
      if (l.remindAt != null && now < l.remindAt) return { kind: 'waitingRecheck', label: 'まだ終わっていなかった（' + fmtTime(l.remindAt) + 'にもう一度確認）', active: true };
      if (l.expectedEnd != null && now < l.expectedEnd) return { kind: 'washing', label: '洗濯中（終了予定まで約' + fmtMin((l.expectedEnd - now) / 1000) + '）', active: true };
      return { kind: 'dueToCheck', label: '終了予定です。確認しよう', active: true };
    }
    if (l.phase === 'hung' && l.day === today) return { kind: 'hung', label: '干し終わり（' + fmtTime(l.hungAt) + '）', active: false };
    if (l.phase === 'notWashing' && l.day === today) return { kind: 'notWashing', label: '今日は洗濯しない', active: false };
    return { kind: 'notChecked', label: '未実施', active: false };
  }

  // 押すまで鳴らし直すときの文面：[最初の題, 鳴らし直しの題, 本文]
  var REPEAT_TEXT = {
    workout: ['運動を始めよう', '運動はまだ？', '着替えたら「運動開始」を押そう。押した時刻から終了までのプランを作ります'],
    nightStudy: ['夜の勉強', '勉強はまだ？', '机に座って「開始」を押そう。最初の1ページだけでいい'],
    tomorrowPrep: ['翌朝の準備', '機器を閉じよう', '翌朝の準備が済んだら「完了」を押して、電子機器を閉じよう'],
    bedtime: ['ベッドに入ろう', 'ベッドに入ろう', '「完了」を押して、iPad を置こう']
  };

  // ---- 本番アプリで予約する知らせ（その日の分） ----
  function scheduleFor(now, s, data) {
    var day = dayKey(now), ds = data.days[day] || newDay(day), wd = weekday(day), out = [];
    function add(id, channel, at, title, body) { if (at > now) out.push({ id: id, channel: channel, at: at, title: title, body: body }); }
    ORDER.forEach(function (id) {
      var set = s.steps[id], info = INFO[id], r = rec(ds, id);
      if (!stepOn(id, s, wd, ds) || r.status !== 'pending') return;
      // 夜の勉強をもう始めているなら、「机へ・教材準備」は知らせない
      if (id === 'nightSetup' && ds.nightStudyStartedAt) return;
      var at = dateAt(day, set.time);
      // 押すまで鳴らし直す。「あとで」にしたときは、その時刻から数え直す。始めたら（運動開始・演習開始）止める
      var rp = s.repeat && s.repeat[id], text = REPEAT_TEXT[id];
      var started = (id === 'workout' && ds.workout) || (id === 'nightStudy' && ds.nightStudyStartedAt);
      if (rp && rp.on && text && !started) {
        var base = r.laterUntil != null ? Math.max(at, r.laterUntil) : at;
        // 運動は、もとの知らせがないので最初の1回もここで出す
        if (id === 'workout' && !set.notify) add('repeat.workout.0', 'notification', base, text[0], text[2]);
        for (var n = 1; n <= rp.count; n++) add('repeat.' + id + '.' + n, 'notification', base + n * rp.interval * MIN, text[1], text[2]);
      }
      if (set.notify && r.laterUntil != null && r.laterUntil > now) { add('later.' + id, 'notification', r.laterUntil, 'あとで にした「' + info.title + '」', info.guidance); return; }
      if (!set.notify) return;
      if (id === 'wake') {
        add('wake', set.channel, at, todText(set.time) + ' 起床', 'カーテンを開けよう');
        if (s.wake.followUp) for (var k = 1; k <= s.wake.count; k++) add('wake.re' + k, set.channel, at + k * s.wake.interval * MIN, 'カーテンはまだ？', '開けたらアプリで「カーテンを開けた」を押そう');
      } else if (id === 'meditation') {
        // 始めたときに予約する
      } else if (id === 'departure') add('departure', 'notification', at - s.departureWarn * MIN, '出発' + s.departureWarn + '分前', '勉強を保存して、出発しよう');
      else if (id === 'laundryCheck') { if (!laundryDecided(data.laundry, day)) add('laundryCheck', 'notification', at, '運動終了。洗濯かごはいっぱい？', 'いっぱいなら運動着も入れて洗濯機を回し、「洗濯開始」を押そう'); }
      else if (id === 'afterZumba') add('afterZumba', 'notification', at, 'まず机に座ろう', laundryStatus(data.laundry, now).active ? '洗濯物を確認したら、1分だけ勉強を始めよう' : '1分だけ勉強を始めよう');
      else if (id === 'nightStudy') { if (!ds.nightStudyStartedAt) add('nightStudy', set.channel, at, stepTitle(id, s, wd), '最初の1ページを始めよう'); }
      else if (id === 'bedtime') add('bedtime', 'notification', at, 'ベッドに入ろう', 'おやすみなさい。アプリは開かなくて大丈夫');
      else if (id === 'reading') add('step.reading', 'notification', at, '勉強おわり。読書へ', '記録を保存したら、' + info.guidance);
      else if (id === 'tomorrowPrep') add('tomorrowPrep', 'notification', at, '翌朝の準備', '教材・服・持ち物・目覚ましを準備して、電子機器を閉じよう');
      else add('step.' + id, set.channel, at, stepTitle(id, s, wd), info.guidance);
    });
    var m = ds.meditation;
    if (m && rec(ds, 'meditation').status !== 'skipped' && (m.endedAt == null || m.endedAt >= m.plannedEnd))
      add('meditationEnd', s.meditation.endWithAlarm ? 'alarm' : 'notification', m.plannedEnd, '瞑想おわり', '音を止めて、身支度へ');
    if (stepOn('nightStudy', s, wd, ds)) {
      if (!ds.nightStudyStartedAt && !finished(ds, 'nightStudy'))
        s.nudges.forEach(function (n) { if (n.enabled) add('nudge.' + n.id, n.channel, dateAt(day, n.time), '夜の勉強', n.text); });
      // 夜の勉強の最後の部が終わる5分前
      var lastId = null;
      NIGHT_STEPS.forEach(function (x) { if (stepOn(x, s, wd, ds)) lastId = x; });
      if (s.wrapUpNotify && lastId && !finished(ds, lastId))
        add('wrapUp', 'notification', dateAt(day, s.steps[lastId].time + s.steps[lastId].dur) - 5 * MIN, 'あと5分で勉強おわり', '続きと間違いメモを書いて、記録を保存しよう');
    }
    var lr = laundryReminder(data.laundry);
    if (lr != null) add('laundryEnd', 'notification', lr, '洗濯が終了予定です', '終わっているか確認しよう。干したら「干した」を押す');
    var w = ds.workout;
    if (w && !isFinished(w) && !isPaused(w) && w.plan) {
      var seen = {};
      w.plan.segments.forEach(function (g) {
        if (g.kind === 'switchVideo' || g.kind === 'spare' || seen[g.blockID]) return;
        seen[g.blockID] = true;
        add('workout.' + g.blockID, 'notification', g.start, '次：' + g.title, '終了まであと' + Math.floor((w.plan.end - g.start) / MIN) + '分');
      });
    }
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  // ---- Web版：サーバーに預ける通知（今日の残りと、その先の日の分。days 日ぶん） ----
  // 先の日は「まだ何もしていない一日」として並べる。その日にアプリを開けば、押した内容に合わせて預け直す。
  function pushItems(now, s, data, days) {
    var out = [], seen = {}, first = dayKey(now);
    for (var i = 0; i < days; i++) {
      var day = addDays(first, i);
      // 今日の洗濯の状態は、先の日には持ち越さない
      var d = i === 0 ? data : Object.assign({}, data, { laundry: newLaundry() });
      scheduleFor(i === 0 ? now : dayStart(day), s, d).forEach(function (x) {
        var id = day + '.' + x.id;
        if (seen[id]) return;
        seen[id] = true;
        out.push({ id: id, at: x.at, title: x.title, body: x.body });
      });
    }
    // サーバーが預かるのは400件まで。超えそうなら、遠い日の分から落とす（その日までに預け直す）
    return out.sort(function (a, b) { return a.at - b.at || (a.id < b.id ? -1 : 1); }).slice(0, 380);
  }

  var api = {
    MIN: MIN, pad: pad, parts: parts, dayKey: dayKey, dayStart: dayStart, addDays: addDays, weekday: weekday, WD: WD,
    tod: tod, todText: todText, parseTod: parseTod, todOf: todOf, dateAt: dateAt, fmtTime: fmtTime, dayLabel: dayLabel,
    shortLabel: shortLabel, weekStart: weekStart, fmtDur: fmtDur, fmtMin: fmtMin, fmtClock: fmtClock,
    ORDER: ORDER, INFO: INFO, CAT: CAT, DAY_TYPE: DAY_TYPE, SLOT: SLOT, SLOT_STEP: SLOT_STEP,
    defaultSettings: defaultSettings, firstNudge: firstNudge, newDay: newDay, rec: rec, upd: upd, log: log,
    complete: complete, skip: skip, later: later, reopen: reopen, finished: finished, resolve: resolve, snapshot: snapshot,
    makeBlocks: makeBlocks, planWorkout: planWorkout, startWorkout: startWorkout, isPaused: isPaused, isFinished: isFinished,
    currentSeg: currentSeg, nextBlockSeg: nextBlockSeg, pauseWorkout: pauseWorkout, resumeWorkout: resumeWorkout,
    completeCurrent: function (w, t) { advance(w, t, 'done'); }, skipCurrent: function (w, t) { advance(w, t, 'skipped'); },
    refreshWorkout: refreshWorkout, finishWorkout: finishWorkout, workoutSummary: workoutSummary,
    sessionState: sessionState, activeSec: activeSec, needsConfirm: needsConfirm, suggestedEnd: suggestedEnd, praise: praise,
    activeStudySteps: activeStudySteps, phase: phase, NIGHT_STEPS: NIGHT_STEPS, dayKind: dayKind, stepOn: stepOn, nightPart: nightPart, stepTitle: stepTitle,
    dayTotals: dayTotals, weekTotals: weekTotals, bySubject: bySubject, continuation: continuation,
    newLaundry: newLaundry, laundryStart: laundryStart, laundrySkip: laundrySkip, laundryNotYet: laundryNotYet,
    laundryHang: laundryHang, laundryClose: laundryClose, laundryStatus: laundryStatus, laundryDecided: laundryDecided,
    scheduleFor: scheduleFor, pushItems: pushItems
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DayLogic = api;
})(this);
