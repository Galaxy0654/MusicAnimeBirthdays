(function (global) {
  "use strict";

  const CONFIG = global.BIRTHDAY_CONFIG || {};
  const DATA = global.BIRTHDAY_DATA || {};
  const works = DATA.works || [];
  const groups = DATA.groups || [];
  const characters = DATA.characters || [];
  const voiceActors = DATA.voiceActors || [];
  const subjectTypes = CONFIG.SUBJECT_TYPES || {};
  const avatarConfig = CONFIG.AVATAR_CFG || {
    root: "./avatars",
    exts: ["webp"],
    fallbackToRoot: true,
  };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
  const WEEK_CN = "日一二三四五六";
  const CREDIT_STATUS_ORDER = {
    former: 0,
    current: 1,
    alternate: 2,
    guest: 3,
  };

  const workById = new Map(works.map(work => [work.id, work]));
  const groupById = new Map(groups.map(group => [group.id, group]));
  const voiceActorById = new Map(voiceActors.map(actor => [actor.id, actor]));
  const creditsByActor = new Map();

  for (const character of characters) {
    for (const credit of character.voiceCredits || []) {
      if (!creditsByActor.has(credit.voiceActorId)) {
        creditsByActor.set(credit.voiceActorId, []);
      }
      creditsByActor.get(credit.voiceActorId).push({ character, credit });
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function parseBirthday(value) {
    let month;
    let day;
    let year = null;

    if (value && typeof value === "object") {
      month = Number(value.month);
      day = Number(value.day);
      year = value.year == null ? null : Number(value.year);
    } else {
      const match = String(value || "").match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
      if (!match) return null;
      year = match[1] ? Number(match[1]) : null;
      month = Number(match[2]);
      day = Number(match[3]);
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    if (year != null && (!Number.isInteger(year) || year < 1)) return null;

    const maxDay = new Date(Date.UTC(year || 2000, month, 0)).getUTCDate();
    if (day > maxDay) return null;

    return {
      month,
      day,
      year,
      key: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    };
  }

  function namesForGroups(groupIds) {
    return (groupIds || [])
      .map(id => groupById.get(id)?.name)
      .filter(Boolean);
  }

  function creditsForCharacter(character) {
    return [...(character.voiceCredits || [])].sort((left, right) => {
      const statusDelta =
        (CREDIT_STATUS_ORDER[left.status] ?? 99) -
        (CREDIT_STATUS_ORDER[right.status] ?? 99);
      if (statusDelta) return statusDelta;

      const leftName = voiceActorById.get(left.voiceActorId)?.name || "";
      const rightName = voiceActorById.get(right.voiceActorId)?.name || "";
      return leftName.localeCompare(rightName, "zh-Hans-CN");
    });
  }

  function creditLabel(credit) {
    const actor = voiceActorById.get(credit.voiceActorId);
    if (!actor) return "";
    const suffix = {
      former: "（原）",
      alternate: "（替补）",
      guest: "（客串）",
    }[credit.status] || "";
    return `${actor.name}${suffix}`;
  }

  function withBirthday(subject) {
    if (!parseBirthday(subject.birthday)) return null;
    return subject;
  }

  function characterSubject(character) {
    const work = workById.get(character.workId);
    const groupNames = namesForGroups(character.groupIds);
    const credits = creditsForCharacter(character);
    const actorNames = credits.map(creditLabel).filter(Boolean);

    return withBirthday({
      ...character,
      subjectType: "character",
      workName: work?.name || character.workId,
      groupNames,
      actorNames,
      contextText: [work?.name, ...groupNames].filter(Boolean).join(" / "),
      relationText: actorNames.length ? `CV：${actorNames.join("、")}` : "",
      colorKey: work ? `work:${work.id}` : `work:${character.workId}`,
      colorLabel: work?.name || character.workId,
      color: work?.color || CONFIG.DEFAULT_COLOR || "#b2bec3",
      avatarDir: work?.avatarDir || "",
    });
  }

  function voiceActorSubject(actor) {
    const credits = creditsByActor.get(actor.id) || [];
    const roleNames = credits
      .map(({ character }) => character.name)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
    const type = subjectTypes.voiceActor || {};

    return withBirthday({
      ...actor,
      subjectType: "voiceActor",
      contextText: type.label || "声优",
      relationText: roleNames.length ? `角色：${roleNames.join("、")}` : "",
      colorKey: "voiceActor",
      colorLabel: type.label || "声优",
      color: type.color || CONFIG.DEFAULT_COLOR || "#b2bec3",
      avatarDir: type.avatarDir || "",
    });
  }

  function contactSubject(contact) {
    const type = subjectTypes.contact || {};
    const tags = Array.isArray(contact.tags) ? contact.tags.filter(Boolean) : [];
    const context = [type.label || "熟人", contact.relation, ...tags]
      .filter(Boolean)
      .join(" / ");

    return withBirthday({
      ...contact,
      subjectType: "contact",
      contextText: context,
      relationText: "",
      colorKey: "contact",
      colorLabel: type.label || "熟人",
      color: type.color || CONFIG.DEFAULT_COLOR || "#b2bec3",
      avatarDir: type.avatarDir || "",
    });
  }

  const publicCharacterSubjects = characters
    .map(characterSubject)
    .filter(Boolean);
  const publicVoiceActorSubjects = voiceActors
    .map(voiceActorSubject)
    .filter(Boolean);
  const bundledContactSubjects = (
    Array.isArray(global.BIRTHDAY_CONTACTS) ? global.BIRTHDAY_CONTACTS : []
  )
    .map(contactSubject)
    .filter(Boolean);
  const publicSubjects = [
    ...publicCharacterSubjects,
    ...publicVoiceActorSubjects,
    ...bundledContactSubjects,
  ];
  const publicSubjectIds = new Set(publicSubjects.map(subject => subject.id));

  function parseLocalContacts(raw) {
    if (!raw) return [];

    let rows = raw;
    if (typeof raw === "string") {
      try {
        rows = JSON.parse(raw);
      } catch (error) {
        console.warn("本地熟人数据不是有效 JSON，已忽略。", error);
        return [];
      }
    }

    if (!Array.isArray(rows)) {
      console.warn("本地熟人数据必须是数组，已忽略。");
      return [];
    }

    const subjects = [];
    const seenIds = new Set();

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      if (!row.id || !row.name || publicSubjectIds.has(row.id) || seenIds.has(row.id)) {
        console.warn("跳过 ID 无效或重复的本地熟人记录。", row);
        continue;
      }

      const subject = contactSubject(row);
      if (!subject) {
        console.warn("跳过生日无效的本地熟人记录。", row);
        continue;
      }

      seenIds.add(row.id);
      subjects.push(subject);
    }

    return subjects;
  }

  function loadLocalContacts() {
    if (typeof global.localStorage === "undefined") return [];

    const key = CONFIG.LOCAL_CONTACTS_KEY || "birthday.contacts.v1";
    try {
      return parseLocalContacts(global.localStorage.getItem(key));
    } catch (error) {
      console.warn("读取本地熟人数据失败，已忽略。", error);
      return [];
    }
  }

  function getBirthdaySubjects() {
    return [...publicSubjects, ...loadLocalContacts()];
  }

  function nowInChina() {
    return new Date(Date.now() + CHINA_OFFSET_MS);
  }

  function findBirthdaysOn(list, date) {
    const monthDay = `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate()
    ).padStart(2, "0")}`;
    const year = date.getUTCFullYear();
    const catchLeapDay = monthDay === "02-28" && !isLeapYear(year);

    return list
      .map(subject => {
        const birthday = parseBirthday(subject.birthday);
        return birthday ? { subject, birthday } : null;
      })
      .filter(({ birthday }) =>
        birthday.key === monthDay || (catchLeapDay && birthday.key === "02-29")
      )
      .map(({ subject, birthday }) => ({
        ...subject,
        age: birthday.year == null ? null : year - birthday.year,
      }));
  }

  const byName = (left, right) =>
    left.name.localeCompare(right.name, "zh-Hans-CN");

  function findTodaysBirthdays(list, today = nowInChina()) {
    return findBirthdaysOn(list, today).sort(byName);
  }

  function findUpcomingBirthdays(list, days = 15, startOffset = 1) {
    const base = nowInChina();
    const result = [];

    for (let offset = startOffset; offset < startOffset + days; offset++) {
      const date = new Date(base.getTime() + offset * DAY_MS);
      const people = findBirthdaysOn(list, date).sort(byName);
      if (people.length) result.push({ date, offset, people });
    }

    return result;
  }

  function subjectMetaLines(subject) {
    return [subject.contextText, subject.relationText].filter(Boolean);
  }

  function subjectMetaText(subject, separator = " · ") {
    return subjectMetaLines(subject).join(separator);
  }

  function subjectMetaHTML(subject, options = {}) {
    const { agePrefix = "", includeAge = true } = options;
    const lines = subjectMetaLines(subject)
      .map(line => `<span>${escapeHTML(line)}</span>`);

    if (includeAge && subject.age != null) {
      lines.push(`<span class="age-tag">${agePrefix}${subject.age} 岁</span>`);
    }

    return lines.join("");
  }

  function colorForSubject(subject) {
    return subject.color || CONFIG.DEFAULT_COLOR || "#b2bec3";
  }

  function colorKeyOf(subject) {
    return subject.colorKey || "";
  }

  function colorLabelOf(subject) {
    return subject.colorLabel || subject.contextText || "";
  }

  function avatarCandidates(subject) {
    if (subject.avatar) return [subject.avatar];
    if (subject.subjectType === "contact") return [];
    if (!subject.name) return [];

    const root = String(avatarConfig.root || "./avatars").replace(/\/$/, "");
    const dirs = [];
    if (subject.avatarDir) dirs.push(subject.avatarDir);
    if (avatarConfig.fallbackToRoot || !dirs.length) dirs.push("");

    const urls = [];
    for (const dir of new Set(dirs)) {
      const directory = dir ? `${encodeURIComponent(dir)}/` : "";
      for (const extension of avatarConfig.exts || ["webp"]) {
        urls.push(
          `${root}/${directory}${encodeURIComponent(subject.name)}.${extension}`
        );
      }
    }
    return urls;
  }

  const avatarCandidatesByKey = new Map();
  let avatarSequence = 0;

  function resetAvatars() {
    avatarCandidatesByKey.clear();
  }

  function avatarHTML(subject, options = {}) {
    const classes = ["avatar"];
    if (options.small) classes.push("sm");
    if (options.className) classes.push(options.className);

    const className = classes.join(" ");
    const background = colorForSubject(subject);
    const initial = String(subject.name || "?").trim().slice(0, 1) || "?";
    const candidates = avatarCandidates(subject);

    if (!candidates.length) {
      return `<span class="${escapeHTML(className)}" style="background:${escapeHTML(
        background
      )}">${escapeHTML(initial)}</span>`;
    }

    const key = `avatar-${++avatarSequence}`;
    avatarCandidatesByKey.set(key, candidates);

    return `<img class="${escapeHTML(className)}"
      src="${escapeHTML(candidates[0])}"
      alt="${escapeHTML(subject.name || "")}"
      style="background:${escapeHTML(background)}"
      data-avatar-key="${key}"
      data-avatar-index="0"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer">`;
  }

  function replaceFailedAvatar(image) {
    const placeholder = document.createElement("span");
    placeholder.className = image.className;
    placeholder.style.background = image.style.background;
    placeholder.textContent = String(image.alt || "?").trim().slice(0, 1) || "?";
    image.replaceWith(placeholder);
  }

  function handleAvatarError(event) {
    const image = event.target;
    if (!image || image.tagName !== "IMG" || !image.dataset.avatarKey) return;

    const candidates = avatarCandidatesByKey.get(image.dataset.avatarKey) || [];
    const nextIndex = Number(image.dataset.avatarIndex) + 1;

    if (nextIndex < candidates.length) {
      image.dataset.avatarIndex = String(nextIndex);
      image.src = candidates[nextIndex];
      return;
    }

    replaceFailedAvatar(image);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("error", handleAvatarError, true);
  }

  function validateData() {
    const issues = [];
    const ids = new Set();

    for (const work of works) {
      if (!work.id || !work.name) issues.push("作品缺少 id 或 name。");
    }
    for (const group of groups) {
      if (!workById.has(group.workId)) {
        issues.push(`组合 ${group.id} 引用了不存在的作品 ${group.workId}。`);
      }
    }

    for (const character of characters) {
      if (ids.has(character.id)) issues.push(`ID 重复：${character.id}`);
      ids.add(character.id);
      if (!workById.has(character.workId)) {
        issues.push(`角色 ${character.id} 引用了不存在的作品。`);
      }
      if (!parseBirthday(character.birthday)) {
        issues.push(`角色 ${character.id} 的生日无效。`);
      }

      const creditKeys = new Set();
      for (const groupId of character.groupIds || []) {
        const group = groupById.get(groupId);
        if (!group) {
          issues.push(`角色 ${character.id} 引用了不存在的组合 ${groupId}。`);
        } else if (group.workId !== character.workId) {
          issues.push(`角色 ${character.id} 与组合 ${groupId} 不属于同一作品。`);
        }
      }
      for (const credit of character.voiceCredits || []) {
        const key = `${credit.voiceActorId}\0${credit.status || "current"}`;
        if (creditKeys.has(key)) {
          issues.push(`角色 ${character.id} 存在重复声优关系：${key}`);
        }
        creditKeys.add(key);
        if (!voiceActorById.has(credit.voiceActorId)) {
          issues.push(
            `角色 ${character.id} 引用了不存在的声优 ${credit.voiceActorId}。`
          );
        }
      }
    }

    for (const actor of voiceActors) {
      if (ids.has(actor.id)) issues.push(`ID 重复：${actor.id}`);
      ids.add(actor.id);
      if (!parseBirthday(actor.birthday)) {
        issues.push(`声优 ${actor.id} 的生日无效。`);
      }
    }

    for (const contact of bundledContactSubjects) {
      if (ids.has(contact.id)) issues.push(`ID 重复：${contact.id}`);
      ids.add(contact.id);
      if (!contact.id || !contact.name) {
        issues.push("熟人记录缺少 id 或 name。");
      }
      if (!parseBirthday(contact.birthday)) {
        issues.push(`熟人 ${contact.id || contact.name} 的生日无效。`);
      }
    }

    return issues;
  }

  const validationIssues = validateData();
  if (validationIssues.length) {
    console.warn("生日数据存在完整性问题：", validationIssues);
  }

  function getWorks() {
    return works;
  }

  function getRolesForVoiceActor(id) {
    return (creditsByActor.get(id) || []).map(({ character, credit }) => ({
      character,
      credit,
    }));
  }

  function scheduleChinaMidnightRefresh(callback) {
    function schedule() {
      const now = Date.now();
      const chinaNow = now + CHINA_OFFSET_MS;
      const chinaMidnight = Math.floor(chinaNow / DAY_MS) * DAY_MS;
      const nextMidnight = chinaMidnight + DAY_MS - CHINA_OFFSET_MS + 5000;
      const delay = Math.max(nextMidnight - now, 1000);

      setTimeout(() => {
        callback();
        schedule();
      }, delay);
    }

    schedule();
  }

  global.BirthdayCore = {
    WEEK_CN,
    avatarHTML,
    byName,
    colorForSubject,
    colorKeyOf,
    colorLabelOf,
    escapeHTML,
    findBirthdaysOn,
    findTodaysBirthdays,
    findUpcomingBirthdays,
    getBirthdaySubjects,
    getRolesForVoiceActor,
    getWorks,
    nowInChina,
    parseBirthday,
    parseLocalContacts,
    resetAvatars,
    scheduleChinaMidnightRefresh,
    subjectMetaHTML,
    subjectMetaText,
    validateData,
  };
})(window);
