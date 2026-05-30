const state = {
  fingerprint: null,
  studentId: null,
  groupId: null,
  groupSize: 2,
  subjects: [],
  subjectIndex: 0,
  pollingId: null,
};

const sections = [
  'step-identify',
  'step-size',
  'step-partner',
  'step-third',
  'step-subject',
  'step-dashboard',
];

function $(id) {
  return document.getElementById(id);
}

function setStatus(message, type) {
  const status = $('status');
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

function setSection(id) {
  sections.forEach((sectionId) => {
    $(sectionId).classList.toggle('hidden', sectionId !== id);
  });
  setPolling(id === 'step-dashboard');
}

function setPolling(active) {
  if (active && !state.pollingId) {
    state.pollingId = setInterval(refreshSession, 5000);
  }
  if (!active && state.pollingId) {
    clearInterval(state.pollingId);
    state.pollingId = null;
  }
}

async function apiGet(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
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

async function loadFingerprint() {
  if (!window.FingerprintJS) {
    throw new Error('FingerprintJS not loaded');
  }
  const fp = await window.FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
}

function fillSelect(select, students) {
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- Choisir --';
  select.appendChild(placeholder);

  students.forEach((student) => {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = student.full_name;
    select.appendChild(option);
  });
}

async function showIdentify() {
  setSection('step-identify');
  const data = await apiGet('/api/student/available-initial');
  fillSelect($('student-select'), data.students);
}

async function showGroupSize() {
  setSection('step-size');
  const triad = await apiGet('/api/student/triad-status');
  const triadInput = $('size-3');
  const triadNote = $('triad-note');

  if (triad.available) {
    triadInput.disabled = false;
    triadNote.textContent = `${triad.used}/${triad.max} utilises`;
  } else {
    triadInput.disabled = true;
    triadNote.textContent = 'limite atteinte';
  }
}

async function showPartnerSelect() {
  setSection('step-partner');
  const data = await apiGet(
    `/api/student/available-partners?fingerprint=${encodeURIComponent(state.fingerprint)}`
  );
  fillSelect($('partner-select'), data.students);
}

async function showThirdSelect() {
  setSection('step-third');
  const data = await apiGet(
    `/api/student/available-third?fingerprint=${encodeURIComponent(
      state.fingerprint
    )}&groupId=${state.groupId}`
  );
  fillSelect($('third-select'), data.students);
}

function renderSubject() {
  if (!state.subjects.length) {
    $('subject-title').textContent = 'Aucun sujet disponible';
    $('subject-desc').textContent = '';
    $('subject-css').textContent = '';
    $('subject-index').textContent = '';
    return;
  }

  const subject = state.subjects[state.subjectIndex];
  $('subject-title').textContent = subject.title;
  $('subject-desc').textContent = subject.description;
  $('subject-css').textContent = subject.css;
  $('subject-index').textContent = `${state.subjectIndex + 1} / ${state.subjects.length}`;
}

async function showSubjectSelect() {
  setSection('step-subject');
  const data = await apiGet('/api/student/subjects');
  state.subjects = data.subjects || [];
  state.subjectIndex = 0;
  renderSubject();
}

function renderDashboard(data) {
  const group = data.group;
  if (!group) {
    showGroupSize();
    return;
  }

  if (group.needsThird && group.leaderId === data.student.id) {
    state.groupId = group.id;
    showThirdSelect();
    return;
  }

  if (group.needsSubject && group.leaderId === data.student.id) {
    state.groupId = group.id;
    showSubjectSelect();
    return;
  }

  setSection('step-dashboard');
  $('dash-name').textContent = data.student.fullName;
  $('dash-status').textContent = group.status === 'confirmed' ? 'Confirme' : 'En attente';
  $('dash-size').textContent = `Groupe de ${group.groupSize}`;

  const members = [group.leaderName, group.secondName, group.thirdName].filter(Boolean);
  $('dash-members').textContent = members.join(' + ');

  if (group.subjectTitle) {
    $('dash-subject').textContent = group.subjectTitle;
    $('dash-subject-note').textContent = '';
  } else {
    $('dash-subject').textContent = 'Non choisi';
    $('dash-subject-note').textContent = 'En attente du choix du sujet.';
  }

  const actions = $('dash-actions');
  actions.innerHTML = '';
  if (group.canRespond) {
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'btn-primary';
    acceptBtn.textContent = 'Accepter';
    acceptBtn.onclick = () => respondToGroup(group.id, 'accept');

    const refuseBtn = document.createElement('button');
    refuseBtn.className = 'btn-danger';
    refuseBtn.textContent = 'Refuser';
    refuseBtn.onclick = () => respondToGroup(group.id, 'refuse');

    actions.appendChild(acceptBtn);
    actions.appendChild(refuseBtn);
  }
}

async function refreshSession() {
  try {
    const data = await apiPost('/api/student/me', { fingerprint: state.fingerprint });
    if (!data.found) {
      state.studentId = null;
      state.groupId = null;
      await showIdentify();
      return;
    }

    state.studentId = data.student.id;
    if (data.group) {
      state.groupId = data.group.id;
    }
    renderDashboard(data);
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function respondToGroup(groupId, decision) {
  try {
    await apiPost('/api/student/group/respond', {
      fingerprint: state.fingerprint,
      groupId,
      decision,
    });
    await refreshSession();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function handleIdentify() {
  try {
    const studentId = Number($('student-select').value);
    if (!studentId) {
      setStatus('Choisissez votre nom.', 'error');
      return;
    }
    const result = await apiPost('/api/student/register', {
      studentId,
      fingerprint: state.fingerprint,
    });
    state.studentId = result.studentId;
    setStatus('', '');
    await refreshSession();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function handleSize() {
  const selected = document.querySelector('input[name="group-size"]:checked');
  state.groupSize = Number(selected.value);
  await showPartnerSelect();
}

async function handlePartner() {
  try {
    const partnerId = Number($('partner-select').value);
    if (!partnerId) {
      setStatus('Choisissez un binome.', 'error');
      return;
    }
    const result = await apiPost('/api/student/group/create', {
      fingerprint: state.fingerprint,
      partnerId,
      groupSize: state.groupSize,
    });
    state.groupId = result.groupId;
    setStatus('', '');
    if (state.groupSize === 3) {
      await showThirdSelect();
    } else {
      await showSubjectSelect();
    }
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function handleThird() {
  try {
    const thirdStudentId = Number($('third-select').value);
    if (!thirdStudentId) {
      setStatus('Choisissez un troisieme.', 'error');
      return;
    }
    await apiPost('/api/student/group/third', {
      fingerprint: state.fingerprint,
      groupId: state.groupId,
      thirdStudentId,
    });
    setStatus('', '');
    await showSubjectSelect();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function handleSubjectChoose() {
  try {
    const subject = state.subjects[state.subjectIndex];
    if (!subject) {
      setStatus('Aucun sujet disponible.', 'error');
      return;
    }
    await apiPost('/api/student/group/subject', {
      fingerprint: state.fingerprint,
      groupId: state.groupId,
      subjectId: subject.id,
    });
    setStatus('', '');
    await refreshSession();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function handleCarousel(delta) {
  if (!state.subjects.length) {
    return;
  }
  const length = state.subjects.length;
  state.subjectIndex = (state.subjectIndex + delta + length) % length;
  renderSubject();
}

async function init() {
  try {
    state.fingerprint = await loadFingerprint();
    await refreshSession();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('identify-btn').addEventListener('click', handleIdentify);
  $('size-continue').addEventListener('click', handleSize);
  $('partner-btn').addEventListener('click', handlePartner);
  $('third-btn').addEventListener('click', handleThird);
  $('subject-choose').addEventListener('click', handleSubjectChoose);
  $('subject-prev').addEventListener('click', () => handleCarousel(-1));
  $('subject-next').addEventListener('click', () => handleCarousel(1));
  init();
});
