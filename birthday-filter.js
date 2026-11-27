(function (global) {
  "use strict";

  const Core = global.BirthdayCore;
  const STORAGE_KEY = "birthday.filters.v1";
  const DEFAULT_FILTERS = {
    showCharacters: true,
    showVoiceActors: true,
    showContacts: true,
  };
  const listeners = new Set();
  let filters = loadFilters();
  let mount = null;

  function getWorkIds() {
    return new Set((Core.getWorks() || []).map(work => work.id));
  }

  function normalizeFilters(value) {
    const availableWorkIds = [...getWorkIds()];
    const requestedWorkIds = Array.isArray(value?.workIds)
      ? value.workIds
      : value?.workId
        ? [value.workId]
        : availableWorkIds;

    return {
      showCharacters: value?.showCharacters !== false,
      showVoiceActors: value?.showVoiceActors !== false,
      showContacts: value?.showContacts !== false,
      workIds: availableWorkIds.filter(id => requestedWorkIds.includes(id)),
    };
  }

  function loadFilters() {
    if (typeof global.localStorage === "undefined") {
      return normalizeFilters(DEFAULT_FILTERS);
    }

    try {
      return normalizeFilters(
        JSON.parse(global.localStorage.getItem(STORAGE_KEY) || "{}")
      );
    } catch (error) {
      console.warn("筛选设置读取失败，已使用默认设置。", error);
      return normalizeFilters(DEFAULT_FILTERS);
    }
  }

  function saveFilters() {
    if (typeof global.localStorage === "undefined") return;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.warn("筛选设置保存失败。", error);
    }
  }

  function getState() {
    return { ...filters };
  }

  function filterSubjects(subjects, activeFilters = filters) {
    const active = normalizeFilters(activeFilters);
    const selectedWorkIds = new Set(active.workIds);
    const allWorkIds = getWorkIds();
    const workFilterActive =
      (active.showCharacters || active.showVoiceActors) &&
      selectedWorkIds.size !== allWorkIds.size;

    return subjects.filter(subject => {
      if (subject.subjectType === "contact") {
        return active.showContacts;
      }

      if (subject.subjectType === "voiceActor") {
        if (!active.showVoiceActors) return false;
        if (!workFilterActive) return true;
        return Core.getRolesForVoiceActor(subject.id).some(
          ({ character }) => selectedWorkIds.has(character.workId)
        );
      }

      if (subject.subjectType === "character") {
        if (!active.showCharacters) return false;
        return selectedWorkIds.has(subject.workId);
      }

      return false;
    });
  }

  function getSubjects() {
    return filterSubjects(Core.getBirthdaySubjects(), filters);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emitChange() {
    for (const listener of listeners) {
      listener(getState());
    }
  }

  function setFilters(patch) {
    filters = normalizeFilters({ ...filters, ...patch });
    saveFilters();
    syncControls();
    emitChange();
  }

  function syncControls() {
    if (!mount) return;

    mount.querySelectorAll("[data-filter-type]").forEach(input => {
      input.checked = Boolean(filters[input.dataset.filterType]);
    });

    mount.querySelectorAll("[data-work-id]").forEach(input => {
      input.checked = filters.workIds.includes(input.dataset.workId);
    });

    const workGroup = mount.querySelector("[data-work-group]");
    if (workGroup) {
      workGroup.hidden = !filters.showCharacters && !filters.showVoiceActors;
    }
  }

  function renderFilters() {
    if (!mount) return;

    const options = Core.getWorks()
      .map(work => `
        <label class="filter-work-option">
          <input type="checkbox" data-work-id="${Core.escapeHTML(work.id)}">
          ${Core.escapeHTML(work.name)}
        </label>`)
      .join("");

    mount.innerHTML = `
      <section class="filter-panel" aria-label="生日筛选">
        <div class="filter-types">
          <span class="filter-title">显示</span>
          <label class="filter-option">
            <input type="checkbox" data-filter-type="showCharacters">
            角色
          </label>
          <label class="filter-option">
            <input type="checkbox" data-filter-type="showVoiceActors">
            声优
          </label>
          <label class="filter-option">
            <input type="checkbox" data-filter-type="showContacts">
            熟人
          </label>
        </div>
        <div class="filter-work-group" data-work-group>
          <div class="filter-work-head">
            <span class="filter-title">按作品筛选</span>
            <div class="filter-work-actions">
              <button type="button" data-work-action="all">全选</button>
              <button type="button" data-work-action="none">全不选</button>
            </div>
          </div>
          <div class="filter-work-options">${options}</div>
        </div>
      </section>`;

    mount.addEventListener("change", event => {
      const typeInput = event.target.closest("[data-filter-type]");
      if (typeInput) {
        setFilters({ [typeInput.dataset.filterType]: typeInput.checked });
        return;
      }

      const workInput = event.target.closest("[data-work-id]");
      if (workInput) {
        const workIds = [...mount.querySelectorAll("[data-work-id]:checked")]
          .map(input => input.dataset.workId);
        setFilters({ workIds });
      }
    });

    mount.addEventListener("click", event => {
      const workAction = event.target.closest("[data-work-action]");
      if (workAction) {
        setFilters({
          workIds:
            workAction.dataset.workAction === "all"
              ? [...getWorkIds()]
              : [],
        });
      }
    });

    syncControls();
  }

  function init() {
    mount = document.getElementById("birthdayFilters");
    if (!mount) return;
    renderFilters();
  }

  global.BirthdayFilters = {
    filterSubjects,
    getState,
    getSubjects,
    setFilters,
    subscribe,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  }
})(window);
