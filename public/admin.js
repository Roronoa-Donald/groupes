const adminState = {
  password: sessionStorage.getItem('admin-password') || '',
  subjects: [],
  sessions: [],
};

function $(id) {
  return document.getElementById(id);
}

function setAdminStatus(message, type) {
  const status = $('admin-status');
  if (!message) {
    status.classList.add('hidden');
    status.textContent = '';
    return;
  }
  status.classList.remove('hidden');
  status.classList.remove('error', 'ok');
  if (type) {
    status.classList.add(type);
  }
  status.textContent = message;
}

async function apiPost(url, payload) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (adminState.password && !url.endsWith('/login')) {
    headers['x-admin-password'] = adminState.password;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function fillSelect(select, items, options) {
  if (!select) {
    return;
  }
  const placeholder = (options && options.placeholder) || '-- Choisir --';
  const getLabel = options && options.getLabel;
  const disableWhenEmpty = options ? options.disableWhenEmpty !== false : true;

  select.innerHTML = '';
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = placeholder;
  select.appendChild(placeholderOpt);

  if (!items.length) {
    if (disableWhenEmpty) {
      select.disabled = true;
      placeholderOpt.textContent = 'Aucun disponible';
      return;
    }
    select.disabled = false;
    return;
  }

  select.disabled = false;
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = getLabel ? getLabel(item) : item.title || item.full_name || String(item.id);
    select.appendChild(opt);
  });
}

async function apiGet(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-admin-password': adminState.password,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function renderGroups(groups, subjects) {
  const tbody = $('group-table');
  tbody.innerHTML = '';
  if (!groups.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'Aucun groupe pour le moment.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const availableSubjects = Array.isArray(subjects) && subjects.length
    ? subjects
    : adminState.subjects;

  groups.forEach((group) => {
    const row = document.createElement('tr');
    const members = [group.leader_name, group.second_name, group.third_name].filter(Boolean);

    const membersCell = document.createElement('td');
    membersCell.textContent = members.join(' + ');

    const subjectCell = document.createElement('td');
    const currentSubjectId = group.subject_id ? Number(group.subject_id) : null;
    const currentSubjectTitle = group.subject_title || '';
    const subjectWrap = document.createElement('div');
    subjectWrap.className = 'subject-controls';

    const currentLabel = document.createElement('div');
    currentLabel.className = 'subtitle';
    const currentDisplay = currentSubjectTitle || (currentSubjectId ? `Sujet #${currentSubjectId}` : '');
    currentLabel.textContent = currentDisplay ? `Actuel: ${currentDisplay}` : 'Non choisi';

    const select = document.createElement('select');
    const nullOpt = document.createElement('option');
    nullOpt.value = '';
    nullOpt.textContent = '-- Non choisi --';
    select.appendChild(nullOpt);

    let hasCurrent = false;
    availableSubjects.forEach((sub) => {
      const subId = Number(sub.id);
      const opt = document.createElement('option');
      opt.value = subId;
      opt.textContent = sub.title;
      if (currentSubjectId && subId === currentSubjectId) {
        opt.selected = true;
        hasCurrent = true;
      }
      select.appendChild(opt);
    });

    if (currentSubjectId && !hasCurrent) {
      const opt = document.createElement('option');
      opt.value = currentSubjectId;
      opt.textContent = currentSubjectTitle || `Sujet #${currentSubjectId}`;
      opt.selected = true;
      select.appendChild(opt);
    }

    let lastSelectedId = currentSubjectId;

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-danger';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reinitialiser';
    resetBtn.disabled = false;

    select.addEventListener('change', async () => {
      const newSubId = select.value ? Number(select.value) : null;
      const previousId = lastSelectedId;
      const previousLabel = currentLabel.textContent;
      const selectedTitle = newSubId ? select.options[select.selectedIndex]?.textContent : '';
      try {
        select.disabled = true;
        resetBtn.disabled = true;
        await apiPost('/api/admin/update-subject', { groupId: group.id, subjectId: newSubId });
        lastSelectedId = newSubId;
        currentLabel.textContent = newSubId ? `Actuel: ${selectedTitle}` : 'Non choisi';
        resetBtn.disabled = false;
        setAdminStatus('Sujet mis a jour avec succes', 'ok');
        setTimeout(() => setAdminStatus('', ''), 3000);
      } catch (err) {
        select.value = previousId ? String(previousId) : '';
        currentLabel.textContent = previousLabel;
        resetBtn.disabled = false;
        setAdminStatus('Erreur: ' + err.message, 'error');
      } finally {
        select.disabled = false;
      }
    });

    resetBtn.addEventListener('click', async () => {
      if (!lastSelectedId) {
        setAdminStatus('Aucun sujet a reinitialiser.', 'error');
        return;
      }
      const previousId = lastSelectedId;
      const previousLabel = currentLabel.textContent;
      try {
        select.disabled = true;
        resetBtn.disabled = true;
        await apiPost('/api/admin/update-subject', { groupId: group.id, subjectId: null });
        lastSelectedId = null;
        select.value = '';
        currentLabel.textContent = 'Non choisi';
        setAdminStatus('Sujet reinitialise. Le groupe doit choisir de nouveau.', 'ok');
        setTimeout(() => setAdminStatus('', ''), 3000);
      } catch (err) {
        lastSelectedId = previousId;
        select.value = previousId ? String(previousId) : '';
        currentLabel.textContent = previousLabel;
        setAdminStatus('Erreur: ' + err.message, 'error');
      } finally {
        select.disabled = false;
        resetBtn.disabled = false;
      }
    });

    const actions = document.createElement('div');
    actions.className = 'subject-actions';
    actions.appendChild(resetBtn);

    subjectWrap.appendChild(currentLabel);
    subjectWrap.appendChild(select);
    subjectWrap.appendChild(actions);
    subjectCell.appendChild(subjectWrap);

    const statusCell = document.createElement('td');
    statusCell.textContent = group.status;
    const dateCell = document.createElement('td');
    dateCell.textContent = new Date(group.created_at).toLocaleString();

    row.appendChild(membersCell);
    row.appendChild(subjectCell);
    row.appendChild(statusCell);
    row.appendChild(dateCell);
    tbody.appendChild(row);
  });
}

function maskValue(value) {
  if (!value) {
    return '';
  }
  const str = String(value);
  if (str.length <= 8) {
    return str;
  }
  return `${str.slice(0, 4)}...${str.slice(-3)}`;
}

function renderSessions(sessions) {
  const select = $('session-select');
  const resetBtn = $('session-reset-btn');
  if (!select || !resetBtn) {
    return;
  }
  const items = Array.isArray(sessions) ? sessions : [];
  adminState.sessions = items;

  if (!items.length) {
    fillSelect(select, [], { placeholder: 'Aucune session active', disableWhenEmpty: true });
    resetBtn.disabled = true;
    return;
  }

  fillSelect(select, items, {
    placeholder: '-- Choisir une session --',
    getLabel: (item) => {
      const ip = maskValue(item.ip);
      const fingerprint = maskValue(item.fingerprint);
      const suffix = ip || fingerprint ? ` (${[ip, fingerprint].filter(Boolean).join(' / ')})` : '';
      return `${item.full_name}${suffix}`;
    },
  });
  resetBtn.disabled = false;
}

function setThirdVisibility() {
  const sizeSelect = $('create-size');
  const wrap = $('create-third-wrap');
  if (!sizeSelect || !wrap) {
    return;
  }
  const size = Number(sizeSelect.value || 2);
  wrap.classList.toggle('hidden', size !== 3);
}

function renderCreateGroup(students, subjects) {
  const leaderSelect = $('create-leader');
  const secondSelect = $('create-second');
  const thirdSelect = $('create-third');
  const subjectSelect = $('create-subject');
  const createBtn = $('create-group-btn');

  const subjectList = Array.isArray(subjects) && subjects.length
    ? subjects
    : adminState.subjects;

  fillSelect(leaderSelect, students, { placeholder: '-- Choisir --' });
  fillSelect(secondSelect, students, { placeholder: '-- Choisir --' });
  fillSelect(thirdSelect, students, { placeholder: '-- Choisir --' });
  fillSelect(subjectSelect, subjectList, {
    placeholder: '-- Non choisi --',
    getLabel: (item) => item.title,
    disableWhenEmpty: false,
  });

  if (createBtn) {
    createBtn.disabled = !students.length;
  }
  setThirdVisibility();
}

function getSelectedId(select) {
  if (!select) {
    return null;
  }
  const value = Number(select.value || 0);
  return value ? value : null;
}

async function handleCreateGroup() {
  const size = Number($('create-size').value || 2);
  const leaderId = getSelectedId($('create-leader'));
  const secondId = getSelectedId($('create-second'));
  const thirdId = getSelectedId($('create-third'));
  const subjectId = getSelectedId($('create-subject'));

  if (!leaderId || !secondId) {
    setAdminStatus('Choisissez les membres du groupe.', 'error');
    return;
  }
  if (![2, 3].includes(size)) {
    setAdminStatus('Taille du groupe invalide.', 'error');
    return;
  }
  if (leaderId === secondId) {
    setAdminStatus('Les membres doivent etre differents.', 'error');
    return;
  }
  if (size === 3 && !thirdId) {
    setAdminStatus('Choisissez un troisieme membre.', 'error');
    return;
  }
  if (thirdId && (thirdId === leaderId || thirdId === secondId)) {
    setAdminStatus('Les membres doivent etre differents.', 'error');
    return;
  }

  const createBtn = $('create-group-btn');
  try {
    if (createBtn) {
      createBtn.disabled = true;
    }
    await apiPost('/api/admin/groups', {
      leaderId,
      secondId,
      thirdId: size === 3 ? thirdId : null,
      groupSize: size,
      subjectId: subjectId || null,
    });
    setAdminStatus('Groupe cree avec succes.', 'ok');
    setTimeout(() => setAdminStatus('', ''), 3000);
    await loadOverview();
  } catch (err) {
    setAdminStatus('Erreur: ' + err.message, 'error');
  } finally {
    if (createBtn) {
      createBtn.disabled = false;
    }
  }
}

function renderUngrouped(students) {
  const container = $('ungrouped');
  container.innerHTML = '';
  if (!students.length) {
    container.textContent = 'Tous les etudiants sont en groupe.';
    return;
  }
  students.forEach((student) => {
    const item = document.createElement('div');
    item.textContent = student.full_name;
    container.appendChild(item);
  });
}

async function loadOverview() {
  try {
    const data = await apiGet('/api/admin/overview');
    adminState.subjects = Array.isArray(data.subjects) ? data.subjects : [];
    renderGroups(data.groups || [], data.subjects || []);
    renderCreateGroup(data.ungrouped || [], data.subjects || []);
    renderUngrouped(data.ungrouped || []);
    renderSessions(data.sessions || []);
  } catch (err) {
    setAdminStatus(err.message, 'error');
  }
}

async function handleResetSession() {
  const sessionId = getSelectedId($('session-select'));
  if (!sessionId) {
    setAdminStatus('Choisissez une session a reinitialiser.', 'error');
    return;
  }
  const ok = window.confirm('Reinitialiser le fingerprint et l\'IP de cette session ?');
  if (!ok) {
    return;
  }
  const resetBtn = $('session-reset-btn');
  try {
    if (resetBtn) {
      resetBtn.disabled = true;
    }
    await apiPost('/api/admin/sessions/reset', { sessionId });
    setAdminStatus('Session reinitialisee.', 'ok');
    setTimeout(() => setAdminStatus('', ''), 3000);
    await loadOverview();
  } catch (err) {
    setAdminStatus('Erreur: ' + err.message, 'error');
  } finally {
    if (resetBtn) {
      resetBtn.disabled = false;
    }
  }
}

async function handleLogin() {
  try {
    const password = $('admin-password').value.trim();
    if (!password) {
      setAdminStatus('Entrez un mot de passe.', 'error');
      return;
    }
    await apiPost('/api/admin/login', { password });
    adminState.password = password;
    sessionStorage.setItem('admin-password', password);
    $('admin-login').classList.add('hidden');
    $('admin-data').classList.remove('hidden');
    setAdminStatus('', '');
    await loadOverview();
  } catch (err) {
    setAdminStatus('Mot de passe invalide.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('admin-login-btn').addEventListener('click', handleLogin);
  const createBtn = $('create-group-btn');
  if (createBtn) {
    createBtn.addEventListener('click', handleCreateGroup);
  }
  const sessionResetBtn = $('session-reset-btn');
  if (sessionResetBtn) {
    sessionResetBtn.addEventListener('click', handleResetSession);
  }
  const sizeSelect = $('create-size');
  if (sizeSelect) {
    sizeSelect.addEventListener('change', setThirdVisibility);
  }
  if (adminState.password) {
    $('admin-login').classList.add('hidden');
    $('admin-data').classList.remove('hidden');
    loadOverview();
  }
});
