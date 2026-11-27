const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = { window: {}, console };

for (const file of [
  "birthdays.js",
  "contacts.js",
  "birthday-core.js",
  "birthday-filter.js",
]) {
  vm.runInNewContext(
    fs.readFileSync(path.join(root, file), "utf8"),
    context,
    { filename: file }
  );
}

const core = context.window.BirthdayCore;
const filters = context.window.BirthdayFilters;
const data = context.window.BIRTHDAY_DATA;
const contactRows = context.window.BIRTHDAY_CONTACTS || [];
const issues = core.validateData();
const allIds = [
  ...data.characters.map(character => character.id),
  ...data.voiceActors.map(actor => actor.id),
  ...contactRows.map(contact => contact.id),
];

if (new Set(allIds).size !== allIds.length) {
  issues.push("角色与声优 ID 存在重复。");
}

if (!data.characters.length || !data.voiceActors.length) {
  issues.push("角色或声优数据为空。");
}

const requiredRelations = new Set(["亲人", "朋友", "老师"]);
for (const contact of contactRows) {
  if (!requiredRelations.has(contact.relation)) {
    issues.push(`熟人示例缺少关系类型：${contact.name}`);
  }
  if (!contact.contact || !Object.values(contact.contact).some(Boolean)) {
    issues.push(`熟人示例缺少联系方式：${contact.name}`);
  }
}

const localContacts = core.parseLocalContacts(JSON.stringify([{
  id: "local:validation",
  name: "测试熟人",
  birthday: { month: 1, day: 1, year: null },
}]));

if (localContacts.length !== 1) {
  issues.push("本地熟人数据入口不可用。");
}

const subjects = core.getBirthdaySubjects();
const workIds = core.getWorks().map(work => work.id);
const projectSekaiId = "project-sekai";
const projectSekaiCharacters = data.characters.filter(
  character => character.workId === projectSekaiId
);
const projectSekaiActorIds = new Set(
  projectSekaiCharacters.flatMap(character =>
    character.voiceCredits.map(credit => credit.voiceActorId)
  )
);
const projectSekaiExpected =
  projectSekaiCharacters.length +
  projectSekaiActorIds.size +
  contactRows.length;
const filterState = {
  showCharacters: true,
  showVoiceActors: true,
  showContacts: true,
  workIds: [projectSekaiId],
};

if (filters.filterSubjects(subjects, filterState).length !== projectSekaiExpected) {
  issues.push("作品多选筛选结果不正确。");
}

if (
  filters.filterSubjects(subjects, { ...filterState, workIds: [] }).length !==
  contactRows.length
) {
  issues.push("作品全不选时，只应保留不受作品限制的熟人。");
}

if (
  filters.filterSubjects(subjects, {
    ...filterState,
    showCharacters: false,
    showContacts: false,
  }).length !== projectSekaiActorIds.size
) {
  issues.push("仅显示声优时，作品筛选没有正确作用于声优。");
}

if (
  filters.filterSubjects(subjects, {
    ...filterState,
    showCharacters: false,
    showVoiceActors: false,
    showContacts: true,
  }).length !== contactRows.length
) {
  issues.push("角色和声优都关闭时，应只返回熟人。");
}

if (
  filters.filterSubjects(subjects, {
    ...filterState,
    workIds,
  }).length !== subjects.length
) {
  issues.push("作品全选没有恢复全部生日主体。");
}

const chinaOffsetHours = (core.nowInChina().getTime() - Date.now()) / 3600000;
if (chinaOffsetHours < 7.9 || chinaOffsetHours > 8.1) {
  issues.push("东八区时间偏移不正确。");
}

if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  const creditCount = data.characters.reduce(
    (total, character) => total + character.voiceCredits.length,
    0
  );
  console.log(
    `OK: ${data.characters.length} characters, ` +
    `${data.voiceActors.length} voice actors, ` +
    `${data.groups.length} groups, ${creditCount} credits, ` +
    `${contactRows.length} contacts.`
  );
}
