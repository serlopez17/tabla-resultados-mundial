const loginCard = document.querySelector("#loginCard");
const loginForm = document.querySelector("#loginForm");
const playersBody = document.querySelector("#playersBody");
const loginMessage = document.querySelector("#loginMessage");
const logoutButton = document.querySelector("#logoutButton");
const updatedText = document.querySelector("#updatedText");
const editButton = document.querySelector("#editButton");
const saveButton = document.querySelector("#saveButton");
const adminMessage = document.querySelector("#adminMessage");

const emojisById = {
  arielon: "🦁",
  "primo-franc": "🤠",
  bra: "🧢",
  ferras: "⚡",
  manu: "🔥",
  edu: "🎯",
  sergi: "🚀",
  mino: "🧠",
  rony: "🐺"
};

let canEdit = false;
let isEditing = false;
let players = [];
let savedPoints = new Map();

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json();

  if (!response.ok) throw new Error(data.error || "Ocurrio un error");
  return data;
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[character];
  });
}

function render() {
  if (!isEditing) {
    players.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }

  loginCard.classList.toggle("hidden", canEdit);
  logoutButton.classList.toggle("hidden", !canEdit);
  editButton.disabled = isEditing;
  saveButton.disabled = !isEditing;

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !canEdit);
  });

  updatedText.textContent = players.length
    ? `${players.length} participantes registrados`
    : "Todavia no hay participantes registrados";

  playersBody.innerHTML = players
    .map((player, index) => {
      const medal = index === 0 ? "leader" : "";
      const emoji = player.emoji || emojisById[player.id] || "";
      const actions = canEdit && isEditing
        ? `<td class="admin-only actions">
            <button type="button" class="point-button" data-action="decrement" data-id="${player.id}" aria-label="Restar punto a ${escapeHtml(player.name)}">-</button>
            <button type="button" class="point-button" data-action="increment" data-id="${player.id}" aria-label="Sumar punto a ${escapeHtml(player.name)}">+</button>
          </td>`
        : canEdit
          ? `<td class="admin-only actions muted-action">Presiona Editar</td>`
          : "";

      return `<tr class="${medal}">
        <td>${index + 1}</td>
        <td><span class="emoji">${escapeHtml(emoji)}</span>${escapeHtml(player.name)}</td>
        <td><strong>${player.points}</strong></td>
        ${actions}
      </tr>`;
    })
    .join("");
}

async function loadPlayers() {
  const data = await request("/api/players");
  players = data.players.map((player) => ({ ...player, emoji: player.emoji || emojisById[player.id] || "" }));
  savedPoints = new Map(players.map((player) => [player.id, player.points]));
  canEdit = data.canEdit;
  isEditing = false;
  render();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "");

  try {
    const formData = new FormData(loginForm);
    await request("/api/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    loginForm.reset();
    await loadPlayers();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

logoutButton.addEventListener("click", async () => {
  await request("/api/logout", { method: "POST", body: "{}" });
  await loadPlayers();
});

editButton.addEventListener("click", () => {
  isEditing = true;
  setMessage(adminMessage, "Modo edicion activo. Guarda para persistir los cambios.", "");
  render();
});

saveButton.addEventListener("click", async () => {
  const changedPlayers = players.filter((player) => savedPoints.get(player.id) !== player.points);

  if (!changedPlayers.length) {
    isEditing = false;
    setMessage(adminMessage, "No hay cambios por guardar.", "");
    render();
    return;
  }

  try {
    for (const player of changedPlayers) {
      await request(`/api/players/${encodeURIComponent(player.id)}`, {
        method: "PUT",
        body: JSON.stringify({ points: player.points })
      });
    }

    await loadPlayers();
    setMessage(adminMessage, "Cambios guardados", "success");
  } catch (error) {
    setMessage(adminMessage, error.message, "error");
  }
});

playersBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const player = players.find((item) => item.id === button.dataset.id);
  if (!player) return;

  if (button.dataset.action === "increment" || button.dataset.action === "decrement") {
    player.points = button.dataset.action === "increment" ? player.points + 1 : Math.max(0, player.points - 1);
    setMessage(adminMessage, "Cambios pendientes de guardar", "");
    render();
  }
});

loadPlayers().catch((error) => {
  updatedText.textContent = error.message;
});
