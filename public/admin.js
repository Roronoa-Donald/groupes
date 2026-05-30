const adminState = {
  password: sessionStorage.getItem('admin-password') || '',
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
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
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

function renderGroups(groups) {
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

  groups.forEach((group) => {
    const row = document.createElement('tr');
    const members = [group.leader_name, group.second_name, group.third_name].filter(Boolean);

    const membersCell = document.createElement('td');
    membersCell.textContent = members.join(' + ');
    const subjectCell = document.createElement('td');
    subjectCell.textContent = group.subject_title || 'Non choisi';
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
    renderGroups(data.groups || []);
    renderUngrouped(data.ungrouped || []);
  } catch (err) {
    setAdminStatus(err.message, 'error');
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
  if (adminState.password) {
    $('admin-login').classList.add('hidden');
    $('admin-data').classList.remove('hidden');
    loadOverview();
  }
});
