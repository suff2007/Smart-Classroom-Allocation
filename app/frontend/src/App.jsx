import { useEffect, useState } from "react";
import { apiFetch } from "./api";

const navigationItems = [
  ["dashboard", "Overview"],
  ["search", "Classroom search"],
  ["transfers", "Lend / borrow"],
  ["allocation", "Event allocation"],
  ["admin", "Admin"],
  ["login", "Login"],
];

const roleLabels = {
  ADMIN: "Admin",
  COORDINATOR: "Coordinator",
};

const roomTypeLabels = {
  SMART: "Smart classroom",
  BLACKBOARD: "Blackboard classroom",
  REGULAR: "Regular classroom",
  LAB: "Laboratory",
};

const blockLabels = {
  SMV: "Sir M. Visvesvaraya Block",
  SMVB: "Sir M. Visvesvaraya Block (source label SMVB)",
  SVB: "Swami Vivekananda Block",
  CVR: "C. V. Raman Block",
};

function formatBlock(block) {
  return blockLabels[block] || `Unverified inventory label: ${block}`;
}

function isConfirmedBlock(block) {
  return Object.hasOwn(blockLabels, block);
}

function formatApiError(payload, fallback) {
  return payload?.error?.details?.join(" ") || payload?.error?.message || fallback;
}

async function readResponse(response, fallback) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(formatApiError(payload, fallback));
  }
  return payload;
}

function Header({ activeView, setActiveView, user, onLogout }) {
  const visibleItems = navigationItems.filter(([key]) => {
    if (!user) return false;
    if (key === "admin" && user.role !== "ADMIN") return false;
    return key !== "login";
  });

  return (
    <header className="site-header">
      <a className="brand" href={user ? "#dashboard" : "#login"} onClick={() => setActiveView(user ? "dashboard" : "login")}>
        <img className="brand-logo" src="/reva-university-logo.png" alt="REVA University" />
        <span>
          <strong>Campus Operations</strong>
          <small>Smart classroom services</small>
        </span>
      </a>
      <nav aria-label="Main navigation">
        {visibleItems.map(([key, label]) => (
          <button
            className={`nav-item ${activeView === key ? "active" : ""}`}
            key={key}
            onClick={() => {
              if (key === "login") setActiveView("login");
              else setActiveView(key);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        {user ? (
          <>
            <span className="user-chip"><span className="status-dot" /> {user.name} · {roleLabels[user.role] || user.role}</span>
            <button className="button button-secondary button-small" onClick={onLogout} type="button">Logout</button>
          </>
        ) : (
          <span className="user-chip secure-chip"><span className="status-dot" /> Secure portal</span>
        )}
      </div>
    </header>
  );
}

function PageHeading({ eyebrow, title, description }) {
  return (
    <div className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function Alert({ children, variant = "info" }) {
  if (!children) return null;
  return <div className={`alert alert-${variant}`} role={variant === "error" ? "alert" : "status"}>{children}</div>;
}

function AuthGate({ onNavigateToLogin }) {
  return (
    <section className="auth-gate">
      <PageHeading
        eyebrow="ACCESS REQUIRED"
        title="Sign in to continue"
        description="Sign in with your Admin or Coordinator account to access classroom search, room requests, event allocation, and timetable review."
      />
      <div className="auth-actions">
        <button className="button button-primary" onClick={onNavigateToLogin} type="button">Go to login</button>
      </div>
    </section>
  );
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ADMIN");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, role }),
      });
      const payload = await readResponse(response, "Unable to sign in.");
      onLogin(payload.user);
    } catch (loginError) {
      setError(loginError.message || "We couldn't sign you in. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="premium-auth" aria-label="REVA classroom services sign in">
      <div className="auth-showcase">
        <div className="showcase-topline"><span className="live-indicator" /> CAMPUS OPERATIONS PLATFORM</div>
        <div className="showcase-copy">
          <p className="showcase-kicker">SMART CAMPUS · BETTER ALLOCATIONS</p>
          <h1>Every classroom.<br /><em>In sync.</em></h1>
          <p className="showcase-description">A single workspace for classroom availability, timetable evidence, and campus room coordination at REVA University.</p>
          <div className="showcase-feature-list">
            <div><span className="feature-symbol">⌕</span><span><strong>Find the right space</strong><small>Search rooms by time, block and capacity.</small></span></div>
            <div><span className="feature-symbol">▦</span><span><strong>Plan with confidence</strong><small>Review timetable evidence before allocating.</small></span></div>
            <div><span className="feature-symbol">↗</span><span><strong>Coordinate in one place</strong><small>Track room requests and event allocations.</small></span></div>
          </div>
        </div>
        <div className="showcase-bottom"><span>REVA UNIVERSITY</span><span>SMART CLASSROOM & BLACKBOARD ALLOCATION</span></div>
        <div className="showcase-graphic" aria-hidden="true">
          <div className="graphic-ring ring-a" /><div className="graphic-ring ring-b" />
          <div className="graphic-building"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
          <div className="graphic-floating floating-one"><span className="mini-dot green" /> Room intelligence</div>
          <div className="graphic-floating floating-two"><span className="mini-dot gold" /> Timetable-led</div>
        </div>
      </div>
      <div className="auth-side">
        <div className="auth-mobile-brand"><img src="/reva-university-logo.png" alt="REVA University" /><span>Campus operations</span></div>
        <div className="auth-card-wrap">
          <div className="auth-card-heading">
            <span className="auth-overline">WELCOME BACK</span>
            <h2>Sign in to your workspace</h2>
            <p>Use your authorised university operations account to continue.</p>
          </div>
          <form className="premium-login-form" onSubmit={submit}>
            <label className="premium-field"><span>Access role</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="ADMIN">Admin</option><option value="COORDINATOR">Coordinator</option></select></label>
            <label className="premium-field"><span>University email</span><input autoComplete="username" required type="email" placeholder="name@reva.edu.in" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label className="premium-field"><span>Password</span><input autoComplete="current-password" required minLength="8" maxLength="72" type="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <div className="premium-error" role="alert"><span className="error-mark">!</span><span><strong>Sign-in unsuccessful</strong><small>{error}</small></span></div>}
            <button className="premium-submit" disabled={loading} type="submit"><span>{loading ? "Authenticating…" : "Sign in securely"}</span><span className="submit-arrow">↗</span></button>
          </form>
          <div className="auth-security-note"><span className="security-icon">⌑</span><span><strong>Protected campus access</strong><small>Only authorised Admin and Coordinator accounts can enter.</small></span></div>
        </div>
        <div className="auth-side-footer"><span>© REVA University · Campus Services</span><span>Designed for reliable room coordination</span></div>
      </div>
    </section>
  );
}

function Dashboard({ setActiveView, quality, inventory, databaseStatus }) {
  const capacityCount = inventory.filter((room) => room.capacity !== null).length;
  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">REVA UNIVERSITY · CAMPUS OPERATIONS</p>
          <h1>Find the right room, with the facts in view.</h1>
          <p>
            Search the supplied room inventory and review timetable evidence.
            Unverified information is clearly identified before a room is used.
          </p>
          <button className="button button-primary" onClick={() => setActiveView("search")} type="button">
            Search classrooms <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-building"><span /><span /><span /><span /><span /><span /></div>
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
        </div>
      </section>

      <Alert>
        Source timetable legends identify “SMVB” as Sir M. Visvesvaraya Block, matching the confirmed “SMV” name. Inventory labels remain unchanged; “SVB” is a separate block. Room identity remains block plus room number.
      </Alert>

      <section className="metric-grid" aria-label="System status">
        <article className="metric-card">
          <span className="metric-label">Listed rooms</span>
          <strong>{inventory.length || "—"}</strong>
          <span className="metric-detail">From supplied inventory</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Confirmed capacities</span>
          <strong>{inventory.length ? capacityCount : "—"}</strong>
          <span className="metric-detail">Unknown capacity stays unknown</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Timetable entries</span>
          <strong>{quality?.sourceEntryCount ?? "—"}</strong>
          <span className="metric-detail">{quality ? `${quality.acceptedCount} currently eligible` : "Review status unavailable"}</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Database</span>
          <strong className={`metric-state ${databaseStatus === true ? "text-success" : "text-warning"}`}>
            {databaseStatus === true ? "Connected" : databaseStatus === false ? "Disconnected" : "Unavailable"}
          </strong>
          <span className="metric-detail">Live connection status</span>
        </article>
      </section>

      <section className="section-block">
        <div className="section-title">
          <div>
            <p className="eyebrow">WORKSPACE</p>
            <h2>What would you like to do?</h2>
          </div>
        </div>
        <div className="action-grid">
          <button className="action-card" onClick={() => setActiveView("search")} type="button">
            <span className="action-icon">⌕</span><strong>Search a classroom</strong>
            <span>Filter by date, time, block, type and seating capacity.</span><span className="card-arrow">→</span>
          </button>
          <button className="action-card" onClick={() => setActiveView("transfers")} type="button">
            <span className="action-icon">↔</span><strong>Request a room transfer</strong>
            <span>Submit a lend or borrow request for review.</span><span className="card-arrow">→</span>
          </button>
          <button className="action-card" onClick={() => setActiveView("allocation")} type="button">
            <span className="action-icon">▦</span><strong>Plan an event</strong>
            <span>Review what is needed for exams and placement sessions.</span><span className="card-arrow">→</span>
          </button>
        </div>
      </section>

      <Alert>
        {quality
          ? `${quality.rejectedCount} timetable entries remain excluded by strict validation. Search results will not label a room available without complete verified occupancy coverage.`
          : "Timetable validation summary has not been loaded."}
      </Alert>
    </>
  );
}

function RoomCard({ room, onRequest }) {
  const statusClass = room.availabilityStatus.toLowerCase().replaceAll("_", "-");
  return (
    <article className="room-card">
      <div className="room-card-top">
        <div>
          <span className="room-type">{roomTypeLabels[room.classroomType] || room.classroomType}</span>
          <h3 title={formatBlock(room.block)}>{room.block} <span className="room-number">{room.roomNumber}</span></h3>
          <p className={`block-caption ${isConfirmedBlock(room.block) ? "" : "block-unverified"}`}>{formatBlock(room.block)}</p>
        </div>
        <span className={`availability-badge status-${statusClass}`}>
          <span className="status-dot" />{room.availabilityStatus.replaceAll("_", " ")}
        </span>
      </div>
      <div className="room-facts">
        <span><small>Capacity</small><strong>{room.capacity ?? "Unconfirmed"}</strong></span>
        <span><small>Type</small><strong>{roomTypeLabels[room.classroomType] || room.classroomType}</strong></span>
        <span><small>Requested interval</small><strong>{room.requestedDateFrom === room.requestedDateTo ? room.requestedDateFrom : `${room.requestedDateFrom} – ${room.requestedDateTo}`}</strong></span>
        <span><small>Time</small><strong>{room.requestedStartTime} – {room.requestedEndTime}</strong></span>
      </div>
      <p className="room-reason">{room.reason}</p>
      {room.conflicts?.length > 0 && (
        <details className="conflict-details">
          <summary>Evidence details ({room.conflicts.length})</summary>
          <ul>
            {room.conflicts.map((conflict, index) => (
              <li key={`${conflict.type}-${index}`}>
                {conflict.date ? `${conflict.date} · ` : ""}
                {conflict.startTime && `${conflict.startTime}–${conflict.endTime} · `}
                {conflict.subjectOrActivity || conflict.type}
                {conflict.sourceFilename && ` · ${conflict.sourceFilename}`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {onRequest && isConfirmedBlock(room.block) && (
        <button className="button button-secondary button-small" onClick={() => onRequest(room)} type="button">
          Request this room
        </button>
      )}
    </article>
  );
}

function ClassroomSearch({ onRequest }) {
  const [form, setForm] = useState({
    dateFrom: "",
    dateTo: "",
    startTime: "",
    endTime: "",
    block: "",
    classroomType: "",
    minimumCapacity: "",
    roomNumber: "",
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function search(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(form)) {
        if (value) params.set(key, value);
      }
      if (form.dateFrom && !form.dateTo) params.set("dateTo", form.dateFrom);
      const response = await apiFetch(`/api/classrooms/availability?${params}`);
      setResults(await readResponse(response, "Unable to search classrooms."));
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="ROOM FINDER"
        title="Classroom availability"
        description="Search the supplied inventory. Availability is reported only when evidence supports it; missing data is never treated as a free room."
      />
      <form className="filter-panel" onSubmit={search}>
        <div className="filter-grid">
          <label>Date from<input required type="date" value={form.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} /></label>
          <label>Date to <span className="optional-label">(optional)</span><input type="date" min={form.dateFrom || undefined} value={form.dateTo} onChange={(event) => update("dateTo", event.target.value)} /></label>
          <label>Start time<input required type="time" value={form.startTime} onChange={(event) => update("startTime", event.target.value)} /></label>
          <label>End time<input required type="time" value={form.endTime} onChange={(event) => update("endTime", event.target.value)} /></label>
          <label>Block<select value={form.block} onChange={(event) => update("block", event.target.value)}><option value="">All listed room records</option><option value="SMV">SMV — Sir M. Visvesvaraya Block (includes source label SMVB)</option><option value="SVB">SVB — Swami Vivekananda Block</option><option value="CVR">CVR — C. V. Raman Block</option></select></label>
          <label>Room type<select value={form.classroomType} onChange={(event) => update("classroomType", event.target.value)}><option value="">All types</option><option value="SMART">Smart classroom</option><option value="BLACKBOARD">Blackboard classroom</option><option value="REGULAR">Regular classroom</option><option value="LAB">Laboratory</option></select></label>
          <label>Minimum capacity<input min="1" type="number" value={form.minimumCapacity} onChange={(event) => update("minimumCapacity", event.target.value)} placeholder="Any" /></label>
          <label>Room number<input value={form.roomNumber} onChange={(event) => update("roomNumber", event.target.value)} placeholder="Optional" /></label>
        </div>
        <div className="filter-actions">
          <p>Rooms without confirmed capacity remain visible but cannot be confirmed against a seating requirement.</p>
          <button className="button button-primary" disabled={loading} type="submit">{loading ? "Searching…" : "Search rooms"}</button>
        </div>
      </form>
      <Alert variant="error">{error}</Alert>
      {results && (
        <section className="results-section" aria-live="polite">
          <div className="section-title">
            <div><p className="eyebrow">SEARCH RESULTS</p><h2>{results.resultCount} supplied rooms</h2></div>
            <span className="coverage-note">Coverage: not certified</span>
          </div>
          <Alert>{results.availabilityNotice}</Alert>
          <div className="room-grid">
            {results.results.map((room) => (
              <RoomCard key={`${room.block}-${room.roomNumber}`} room={room} onRequest={onRequest} />
            ))}
          </div>
          {results.results.length === 0 && <div className="empty-state">No supplied rooms match these filters.</div>}
        </section>
      )}
    </>
  );
}

function RoomTransfers({ inventory, initialRoom, setActiveView }) {
  const [room, setRoom] = useState(initialRoom || null);
  const [form, setForm] = useState({
    requestType: "BORROW",
    requesterDepartment: "",
    lendingDepartment: "",
    borrowingDepartment: "",
    date: "",
    startTime: "",
    endTime: "",
    purpose: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState([]);

  useEffect(() => setRoom(initialRoom || null), [initialRoom]);
  useEffect(() => {
    apiFetch("/api/classrooms/transfers")
      .then((response) => readResponse(response, "Unable to load your room requests."))
      .then((payload) => setRequests(payload.requests))
      .catch((requestError) => setError(requestError.message));
  }, []);
  useEffect(() => {
    if (room) {
      setForm((current) => ({ ...current, roomNumber: room.roomNumber, block: room.block }));
    }
  }, [room]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!room) {
      setError("Search for and select a room before submitting a transfer request.");
      return;
    }
    if (!isConfirmedBlock(room.block)) {
      setError("This room has an unresolved block label and cannot be submitted for transfer.");
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch("/api/classrooms/transfers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          roomNumber: room.roomNumber,
          block: room.block,
        }),
      });
      const payload = await readResponse(response, "Unable to submit request.");
      setMessage(payload.message);
      setRequests((current) => [payload.request, ...current]);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="ROOM TRANSFERS"
        title="Lend or borrow a room"
        description="Submit a request for review. Submission does not approve, reserve, or allocate a room."
      />
      <Alert variant="info">
        Your signed-in account name and email are attached to the request. Requests are reviewed by an administrator or coordinator; approval does not itself reserve a room.
      </Alert>
      {!room && (
        <div className="empty-state">
          <p>Search for a room first, then choose “Request this room” from its result.</p>
          <button className="button button-primary" onClick={() => setActiveView("search")} type="button">Go to classroom search</button>
        </div>
      )}
      {room && (
      <form className="form-panel transfer-form" onSubmit={submit}>
        <div className="form-section-heading"><span>01</span><div><h2>Request details</h2><p>Choose the direction and identify the room you searched for.</p></div></div>
        <div className="filter-grid">
          <label>Request type<select required value={form.requestType} onChange={(event) => update("requestType", event.target.value)}><option value="BORROW">Borrow a room</option><option value="LEND">Lend a room</option></select></label>
          <label>Selected room<input aria-readonly="true" readOnly value={`${room.block} ${room.roomNumber} · ${formatBlock(room.block)} · ${roomTypeLabels[room.classroomType] || roomTypeLabels[inventory.find((item) => item.roomNumber === room.roomNumber && item.block === room.block)?.classroomType]} · ${room.capacity ?? "capacity unconfirmed"}`} /></label>
          <label>Requesting department<input required value={form.requesterDepartment} onChange={(event) => update("requesterDepartment", event.target.value)} /></label>
          <label>Lending department<input required value={form.lendingDepartment} onChange={(event) => update("lendingDepartment", event.target.value)} /></label>
          <label>Borrowing department<input required value={form.borrowingDepartment} onChange={(event) => update("borrowingDepartment", event.target.value)} /></label>
          <label>Date<input required type="date" value={form.date} onChange={(event) => update("date", event.target.value)} /></label>
          <label>Start time<input required type="time" value={form.startTime} onChange={(event) => update("startTime", event.target.value)} /></label>
          <label>End time<input required type="time" value={form.endTime} onChange={(event) => update("endTime", event.target.value)} /></label>
          <label className="field-wide">Purpose<textarea required rows="3" value={form.purpose} onChange={(event) => update("purpose", event.target.value)} /></label>
        </div>
        <Alert variant="error">{error}</Alert>
        <Alert>{message}</Alert>
        <div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">{saving ? "Submitting…" : "Submit request"}</button></div>
      </form>
      )}
      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">REQUEST TRACKING</p><h2>Your room requests</h2></div></div>
        {requests.length ? requests.map((request) => (
          <article className="quality-correction" key={request._id}>
            <strong>{request.requestType} · {request.block} {request.roomNumber}</strong>
            <span>{new Date(request.date).toLocaleDateString()} · {request.startTime}–{request.endTime} · {request.status}</span>
            <p>{request.purpose}</p>
          </article>
        )) : <p className="empty-state">No saved room requests.</p>}
      </section>
    </>
  );
}

function EventAllocation() {
  const [form, setForm] = useState({
    eventType: "EXAM",
    participantCount: "",
    date: "",
    startTime: "",
    endTime: "",
    block: "",
    classroomType: "",
    minimumCapacity: "",
  });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState("");

  useEffect(() => {
    apiFetch("/api/classrooms/events")
      .then((response) => readResponse(response, "Unable to load saved event requests."))
      .then((payload) => setEvents(payload.events))
      .catch((loadError) => setEventsError(loadError.message));
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setPreview(null);
    setLoading(true);
    try {
      const requestBody = Object.fromEntries(
        Object.entries(form).filter(([, value]) => value !== ""),
      );
      const response = await apiFetch("/api/classrooms/allocation-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await readResponse(response, "Unable to create allocation preview.");
      setPreview(payload.preview);
    } catch (previewError) {
      setError(previewError.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveEventRequest() {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const requestBody = Object.fromEntries(
        Object.entries(form).filter(([, value]) => value !== ""),
      );
      const response = await apiFetch("/api/classrooms/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await readResponse(response, "Unable to save event request.");
      setSaved(payload.message);
      setEvents((current) => [payload.event, ...current]);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="EVENT PLANNING"
        title="Exam & placement allocation"
        description="Run a capacity-aware, non-binding preview for an exam or placement session. This does not reserve rooms or create an allocation."
      />
      <form className="filter-panel" onSubmit={submit}>
        <div className="filter-grid">
          <label>Event type<select required value={form.eventType} onChange={(event) => update("eventType", event.target.value)}><option value="EXAM">Examination</option><option value="PLACEMENT">Placement training</option></select></label>
          <label>Students / participants<input required min="1" type="number" value={form.participantCount} onChange={(event) => update("participantCount", event.target.value)} /></label>
          <label>Date<input required type="date" value={form.date} onChange={(event) => update("date", event.target.value)} /></label>
          <label>Start time<input required type="time" value={form.startTime} onChange={(event) => update("startTime", event.target.value)} /></label>
          <label>End time<input required type="time" value={form.endTime} onChange={(event) => update("endTime", event.target.value)} /></label>
          <label>Block preference<select value={form.block} onChange={(event) => update("block", event.target.value)}><option value="">All listed room records</option><option value="SMV">SMV — Sir M. Visvesvaraya Block (includes source label SMVB)</option><option value="SVB">SVB — Swami Vivekananda Block</option><option value="CVR">CVR — C. V. Raman Block</option></select></label>
          <label>Room type<select value={form.classroomType} onChange={(event) => update("classroomType", event.target.value)}><option value="">Any type</option><option value="SMART">Smart classroom</option><option value="BLACKBOARD">Blackboard classroom</option><option value="REGULAR">Regular classroom</option><option value="LAB">Laboratory</option></select></label>
          <label>Minimum capacity per room<input min="1" type="number" value={form.minimumCapacity} onChange={(event) => update("minimumCapacity", event.target.value)} /></label>
        </div>
        <div className="filter-actions"><p>Only confirmed capacities and verified available rooms can contribute to a preview.</p><button className="button button-primary" disabled={loading} type="submit">{loading ? "Checking…" : "Preview rooms"}</button></div>
      </form>
      <Alert variant="error">{error}</Alert>
      <Alert>{saved}</Alert>
      {preview && (
        <div className={`notice-card ${preview.status === "PREVIEW_READY" ? "notice-success" : ""}`} role="status">
          <span className="notice-icon">{preview.status === "PREVIEW_READY" ? "✓" : "!"}</span>
          <div><h2>{preview.status.replaceAll("_", " ")}</h2><p>{preview.message}</p>
            <p>
  Requested: {preview.participantCount} participants · suggested capacity:{" "}
  {preview.suggestedCapacity ?? preview.plannedCapacity}
</p>
            {preview.rooms.length > 0 && <ul>{preview.rooms.map((room) => <li key={`${room.block}-${room.roomNumber}`}>{room.block} {room.roomNumber} · capacity {room.capacity}</li>)}</ul>}
          </div>
        </div>
      )}
      {preview && <button className="button button-secondary" type="button" disabled={saving} onClick={saveEventRequest}>{saving ? "Saving…" : "Save event request"}</button>}
      {eventsError && <Alert variant="error">{eventsError}</Alert>}
      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">SAVED REQUESTS</p><h2>Event request history</h2></div></div>
        {events.length ? events.map((event) => (
          <article className="quality-correction" key={event._id}>
            <strong>{event.eventType} · {event.participantCount} participants · {event.previewStatus.replaceAll("_", " ")}</strong>
            <span>{new Date(event.date).toLocaleDateString()} · {event.startTime}–{event.endTime}</span>
            <p>{event.allocationCreated ? "Allocation created" : "No room reserved or allotted"}</p>
          </article>
        )) : <p className="empty-state">No event requests saved.</p>}
      </section>
    </>
  );
}

const correctionFields = [
  ["program", "Program"],
  ["semester", "Semester"],
  ["section", "Section"],
  ["academicYear", "Academic year"],
  ["effectiveFrom", "Effective-from date"],
  ["day", "Weekday"],
  ["startTime", "Start time"],
  ["endTime", "End time"],
  ["subjectOrActivity", "Subject / activity"],
  ["roomNumber", "Period room number"],
  ["block", "Block"],
  ["entryType", "Entry type"],
];

const supportedEntryTypes = [
  "CLASS",
  "LAB",
  "MENTORING",
  "LIBRARY",
  "TUTORIAL",
  "BREAK",
  "LUNCH",
];

function CorrectionProposalForm({ entry, inventory, reviewer, apiKey, onSubmit }) {
  const [field, setField] = useState("roomNumber");
  const [proposedValue, setProposedValue] = useState("");
  const [evidenceType, setEvidenceType] = useState("SOURCE_REFERENCE");
  const [evidenceReference, setEvidenceReference] = useState(entry.sourceFilename || "");
  const [evidenceDetails, setEvidenceDetails] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  function submit(event) {
    event.preventDefault();
    onSubmit({
      sourceIndex: entry.sourceIndex,
      field,
      proposedValue,
      reviewer,
      reviewerConfirmation: "Reviewer confirms the proposed correction and cited evidence were reviewed.",
      reason,
      evidence: {
        type: evidenceType,
        reference: evidenceReference,
        details: evidenceDetails,
      },
    });
  }

  return (
    <form className="correction-form" onSubmit={submit}>
      <h3>Propose a correction</h3>
      <div className="filter-grid correction-grid">
        <label>Field to correct
          <select value={field} onChange={(event) => { setField(event.target.value); setProposedValue(""); }} required>
            {correctionFields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Proposed value
          {field === "roomNumber" ? (
            <select value={proposedValue} onChange={(event) => setProposedValue(event.target.value)} required>
              <option value="">Select an inventory room</option>
              {inventory.map((room) => (
                <option key={`${room.block}-${room.roomNumber}`} value={room.roomNumber}>
                  {room.block} {room.roomNumber}{room.capacity === null ? " · capacity unconfirmed" : ""}
                </option>
              ))}
            </select>
          ) : field === "block" ? (
            <select value={proposedValue} onChange={(event) => setProposedValue(event.target.value)} required>
              <option value="">Select an inventory block</option>
              {[...new Set(inventory.map((room) => room.block))].map((block) => (
                <option key={block} value={block}>
                  {block}{block === "SMVB" ? " · source legend: Sir M. Visvesvaraya Block" : blockLabels[block] ? ` · ${blockLabels[block]}` : ""}
                </option>
              ))}
            </select>
          ) : field === "entryType" ? (
            <select value={proposedValue} onChange={(event) => setProposedValue(event.target.value)} required>
              <option value="">Select a supported type</option>
              {supportedEntryTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          ) : field === "day" ? (
            <select value={proposedValue} onChange={(event) => setProposedValue(event.target.value)} required>
              <option value="">Select a weekday</option>
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          ) : (
            <input
              required
              type={field === "effectiveFrom" ? "date" : field.toLowerCase().includes("time") ? "time" : "text"}
              value={proposedValue}
              onChange={(event) => setProposedValue(event.target.value)}
            />
          )}
        </label>
        <label>Evidence type
          <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}>
            <option value="SOURCE_REFERENCE">Source document reference</option>
            <option value="HUMAN_DECISION">Human decision</option>
          </select>
        </label>
        <label>Source reference
          <input required value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} />
        </label>
        <label className="field-wide">Evidence details
          <textarea required rows="2" value={evidenceDetails} onChange={(event) => setEvidenceDetails(event.target.value)} />
        </label>
        <label className="field-wide">Reason for correction
          <textarea required rows="2" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </div>
      {field === "roomNumber" || field === "block" ? (
        <p className="quality-form-hint">Room identity is block plus room number. If both are wrong or missing, submit both field corrections; they will only apply together when the complete corrected entry validates.</p>
      ) : null}
      <label className="review-confirmation">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />
        I reviewed the evidence and confirm this proposal is accurate.
      </label>
      <button className="button button-primary" type="submit" disabled={!confirmed || !reviewer.trim() || !apiKey}>
        Save pending proposal
      </button>
    </form>
  );
}

function CorrectionDecisionForm({ correction, reviewer, apiKey, onDecision }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form className="decision-form" onSubmit={(event) => {
      event.preventDefault();
      onDecision(correction.correctionId, {
        action: "APPROVE",
        reviewer,
        reason,
        confirmation: "I independently reviewed this correction and authorize the decision.",
      });
    }}>
      <label>Decision reason<textarea required rows="2" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="review-confirmation">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />
        I independently reviewed this proposal before deciding.
      </label>
      <div className="decision-actions">
        <button className="button button-primary" type="submit" disabled={!confirmed || !reviewer.trim() || !apiKey}>Approve proposal</button>
        <button className="button button-secondary" type="button" disabled={!confirmed || !reason.trim() || !reviewer.trim() || !apiKey} onClick={() => onDecision(correction.correctionId, {
          action: "REJECT",
          reviewer,
          reason,
          confirmation: "I independently reviewed this correction and authorize the decision.",
        })}>Reject proposal</button>
      </div>
    </form>
  );
}

function TimetableQuality({ quality, qualityError, inventory, onRefresh }) {
  const [apiKey, setApiKey] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [filter, setFilter] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonCounts = Object.entries(quality?.entryRejectionCounts || {}).sort(
    (first, second) => second[1] - first[1],
  );
  const extractionCounts = Object.entries(quality?.extractionStatusCounts || {}).sort(
    (first, second) => second[1] - first[1],
  );
  const visibleEntries = (quality?.rejectedEntries || []).filter((entry) => {
    const searchText = [
      entry.sourceFilename,
      entry.scheduleId,
      entry.day,
      entry.startTime,
      entry.endTime,
      entry.subjectOrActivity,
      entry.block,
      entry.roomNumber,
      entry.extractionStatus,
      ...entry.reasons.map((reason) => `${reason.code} ${reason.message}`),
    ].join(" ").toLowerCase();
    return searchText.includes(filter.trim().toLowerCase());
  });

  async function submitReviewAction(url, method, body) {
    setBusy(true);
    setRequestError("");
    setRequestMessage("");
    try {
      const response = await apiFetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          "x-review-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });
      const payload = await readResponse(response, "Timetable review action failed.");
      setRequestMessage(payload.message || "Review action saved.");
      await onRefresh();
    } catch (error) {
      setRequestError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="DATA GOVERNANCE"
        title="Timetable verification"
        description="Review evidence against the original source, submit pending corrections, then have an authorized reviewer explicitly approve or reject each proposal."
      />
      {qualityError && <Alert variant="error">{qualityError}</Alert>}
      {requestError && <Alert variant="error">{requestError}</Alert>}
      {requestMessage && <Alert>{requestMessage}</Alert>}
      {quality ? (
        <>
          <section className="review-access-panel">
            <h2>Authorized review access</h2>
            <p>The backend accepts review actions only when <code>TIMETABLE_REVIEW_API_KEY</code> is configured with at least 32 characters. The key is held in this page's memory only. This key authorizes access; the reviewer name is recorded but is not independently verified as a university account.</p>
            {!quality.reviewActionsEnabled && <p className="visual-review-warning">Review actions are disabled until the backend review API key is configured.</p>}
            <div className="review-access-fields">
              <label>Review API key<input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label>
              <label>Reviewer name<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label>
            </div>
          </section>
          <div className="metric-grid quality-metrics">
            <article className="metric-card"><span className="metric-label">Source entries</span><strong>{quality.summary.sourceEntryCount}</strong></article>
            <article className="metric-card"><span className="metric-label">Eligible after validation</span><strong>{quality.summary.acceptedCount}</strong></article>
            <article className="metric-card"><span className="metric-label">Rejected / review needed</span><strong>{quality.summary.rejectedCount}</strong></article>
            <article className="metric-card"><span className="metric-label">Needs visual review</span><strong>{quality.summary.extractionStatusCounts.NEEDS_VISUAL_REVIEW || 0}</strong></article>
            <article className="metric-card"><span className="metric-label">Ambiguous extraction</span><strong>{quality.summary.extractionStatusCounts.AMBIGUOUS || 0}</strong></article>
            <article className="metric-card"><span className="metric-label">Approved corrections applied</span><strong>{quality.summary.appliedCorrectionCount}</strong></article>
            <article className="metric-card"><span className="metric-label">Pending proposals</span><strong>{quality.summary.correctionStatusCounts.PENDING_REVIEW || 0}</strong></article>
            <article className="metric-card"><span className="metric-label">Approved / rejected</span><strong>{(quality.summary.correctionStatusCounts.APPROVED || 0)} / {(quality.summary.correctionStatusCounts.REJECTED || 0)}</strong></article>
          </div>
          <div className="notice-card">
            <span className="notice-icon">i</span>
            <div><h2>Strict validation is active</h2><p>Entries marked ambiguous or needing visual review are not eligible. Section room assignments are not substituted for individual-period room assignments. {quality.summary.acceptedCount === 0 ? "No entries are currently accepted for allocation." : `${quality.summary.acceptedCount} entries pass validation, but complete timetable coverage is still required before availability can be certified.`}</p></div>
          </div>
          <section className="quality-section">
            <h2>Extraction review status</h2>
            <ul className="quality-count-list">
              {extractionCounts.map(([status, count]) => <li key={status}><span>{status.replaceAll("_", " ")}</span><strong>{count}</strong></li>)}
            </ul>
          </section>
          <section className="quality-section">
            <h2>Validation reasons</h2>
            {reasonCounts.length > 0 ? (
              <ul className="quality-count-list">
                {reasonCounts.map(([reason, count]) => <li key={reason}><span>{reason.replaceAll("_", " ")}</span><strong>{count}</strong></li>)}
              </ul>
            ) : <p className="empty-state">No validation errors.</p>}
          </section>
          <section className="quality-section">
            <div className="quality-section-heading">
              <h2>Rejected source entries <span className="quality-subtitle">({visibleEntries.length} shown of {quality.rejectedEntries.length})</span></h2>
              <label>Filter entries<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Source, schedule, reason, room…" /></label>
            </div>
            {visibleEntries.map((entry) => (
              <details className="quality-entry" key={`${entry.sourceIndex}-${entry.scheduleId || "entry"}`}>
                <summary>
                  <span>{entry.sourceFilename || "Unknown source"} · {entry.scheduleId || "Schedule ID unavailable"} · entry {entry.sourceIndex + 1}</span>
                  <span>{entry.extractionStatus || "Status unknown"}</span>
                </summary>
                <p className="quality-entry-meta">
                  {[entry.program, entry.semester, entry.section].filter(Boolean).join(" · ") || "Program/section unavailable"}
                  {" · "}{[entry.effectiveFrom, entry.day, entry.startTime && entry.endTime ? `${entry.startTime}-${entry.endTime}` : null].filter(Boolean).join(" · ") || "Schedule details incomplete"}
                </p>
                <p className="quality-entry-meta">
                  {entry.subjectOrActivity || "Activity unavailable"} · Room: {entry.block ? `${entry.block} ${entry.roomNumber || "?"}` : entry.roomNumber || "Unassigned"}
                </p>
                <ul>{entry.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}><strong>{reason.code.replaceAll("_", " ")}</strong>: {reason.message}</li>)}</ul>
                {entry.extractionStatus === "NEEDS_VISUAL_REVIEW" && <p className="visual-review-warning">Visual review required against the original timetable document. A correction proposal cannot change this extraction status.</p>}
                <CorrectionProposalForm
                  entry={entry}
                  inventory={inventory}
                  reviewer={reviewer}
                  apiKey={apiKey}
                  onSubmit={(proposal) => submitReviewAction("/api/timetable/corrections", "POST", proposal)}
                />
              </details>
            ))}
          </section>
          <section className="quality-section">
            <h2>Correction review</h2>
            <p className="quality-subtitle">
              {quality.summary.appliedCorrectionCount} applied · {quality.summary.unappliedCorrectionCount} not applied
            </p>
            {quality.corrections.length > 0 ? quality.corrections.map((correction, index) => (
              <article className="quality-correction" key={`${correction.collection}-${correction.correctionId || "invalid"}-${index}`}>
                <strong>{correction.correctionId || "Invalid correction"} · {correction.field || "field unspecified"}</strong>
                <span>{correction.sourceFilename || "Source unknown"} · {correction.approvalStatus.replaceAll("_", " ")} · {correction.applied ? "Applied" : "Not applied"}</span>
                {correction.reason && <p>{correction.reason}</p>}
                {correction.rejectionReasons.length > 0 && <ul>{correction.rejectionReasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}</li>)}</ul>}
                {correction.decisionReviewer && <p>Decision by {correction.decisionReviewer}: {correction.decisionReason}</p>}
                {correction.approvalStatus === "PENDING_REVIEW" && (
                  <CorrectionDecisionForm
                    correction={correction}
                    reviewer={reviewer}
                    apiKey={apiKey}
                    onDecision={(correctionId, decision) => submitReviewAction(`/api/timetable/corrections/${encodeURIComponent(correctionId)}/decision`, "PATCH", decision)}
                  />
                )}
              </article>
            )) : <p className="empty-state">No correction records are present.</p>}
          </section>
        </>
      ) : (
        <div className="empty-state">Timetable quality summary is unavailable.</div>
      )}
    </>
  );
}

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadAdminData() {
    try {
      const [summaryResponse, usersResponse, transferResponse] = await Promise.all([
        apiFetch("/api/auth/admin/summary"),
        apiFetch("/api/auth/admin/users"),
        apiFetch("/api/classrooms/transfers"),
      ]);
      const [summaryPayload, usersPayload, transferPayload] = await Promise.all([
        readResponse(summaryResponse, "Unable to load administration summary."),
        readResponse(usersResponse, "Unable to load user accounts."),
        readResponse(transferResponse, "Unable to load room requests."),
      ]);
      setSummary(summaryPayload);
      setUsers(usersPayload.users);
      setTransfers(transferPayload.requests);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  async function updateRole(userId, role) {
    setError("");
    setMessage("");
    try {
      const response = await apiFetch(`/api/auth/admin/users/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await readResponse(response, "Unable to update account role.");
      setMessage("Account role updated.");
      await loadAdminData();
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function decideTransfer(id, status) {
    setError("");
    setMessage("");
    try {
      const response = await apiFetch(`/api/classrooms/transfers/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await readResponse(response, "Unable to update room request.");
      setMessage(payload.message);
      await loadAdminData();
    } catch (decisionError) {
      setError(decisionError.message);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRATION"
        title="Admin dashboard"
        description="Manage demo account roles and review room transfer requests. A decision does not allocate or reserve a room."
      />
      <Alert variant="error">{error}</Alert>
      <Alert>{message}</Alert>
      {summary && (
        <section className="metric-grid" aria-label="Operational summary">
          <article className="metric-card"><span className="metric-label">User accounts</span><strong>{summary.userCount}</strong></article>
          <article className="metric-card"><span className="metric-label">Pending transfer requests</span><strong>{summary.pendingTransferCount}</strong></article>
          <article className="metric-card"><span className="metric-label">Saved event requests</span><strong>{summary.savedEventRequestCount}</strong></article>
          <article className="metric-card"><span className="metric-label">Accounts by role</span><strong>{Object.entries(summary.usersByRole).map(([role, count]) => `${role}: ${count}`).join(" · ") || "—"}</strong></article>
        </section>
      )}
      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">ACCOUNT ACCESS</p><h2>User roles</h2></div></div>
        {users.map((account) => (
          <article className="quality-correction" key={account.id}>
            <strong>{account.name} · {account.email}</strong>
            <span>{account.role} · Created {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : "date unavailable"}</span>
            <label>Role
              <select value={account.role} onChange={(event) => updateRole(account.id, event.target.value)}>
                    <option value="COORDINATOR">Coordinator</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
          </article>
        ))}
        {!users.length && <p className="empty-state">No user records are available.</p>}
      </section>
      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">ROOM TRANSFERS</p><h2>Requests for review</h2></div></div>
        {transfers.map((request) => (
          <article className="quality-correction" key={request._id}>
            <strong>{request.requestType} · {request.block} {request.roomNumber} · {request.status}</strong>
            <span>{request.requesterName} · {request.requesterEmail} · {new Date(request.date).toLocaleDateString()} · {request.startTime}–{request.endTime}</span>
            <p>{request.purpose}</p>
            {request.status === "REQUESTED" && (
              <div className="decision-actions">
                <button className="button button-primary" type="button" onClick={() => decideTransfer(request._id, "APPROVED")}>Approve request</button>
                <button className="button button-secondary" type="button" onClick={() => decideTransfer(request._id, "REJECTED")}>Reject request</button>
              </div>
            )}
          </article>
        ))}
        {!transfers.length && <p className="empty-state">No saved transfer requests.</p>}
      </section>
    </>
  );
}

function App() {
  const [activeView, setActiveView] = useState("login");
  const [inventory, setInventory] = useState([]);
  const [inventoryError, setInventoryError] = useState("");
  const [quality, setQuality] = useState(null);
  const [qualityError, setQualityError] = useState("");
  const [databaseStatus, setDatabaseStatus] = useState(null);
  const [selectedRequestRoom, setSelectedRequestRoom] = useState(null);
  const [user, setUser] = useState(null);

  async function refreshQuality() {
    const response = await apiFetch("/api/timetable/quality");
    const payload = await readResponse(response, "Unable to load timetable status.");
    setQuality({ ...payload, ...payload.summary });
    setQualityError("");
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
      setActiveView("login");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const response = await apiFetch("/api/auth/session");
        const payload = await readResponse(response, "Unable to restore your session.");
        if (!cancelled && payload.user) {
          setUser(payload.user);
          setActiveView("dashboard");
        }
      } catch {
        if (!cancelled) setUser(null);
      }
    }

    restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user) {
      setInventoryError("");
      return undefined;
    }
    let cancelled = false;

    Promise.allSettled([
      apiFetch("/api/classrooms").then((response) => readResponse(response, "Unable to load room inventory.")),
      apiFetch("/api/db-health").then((response) => readResponse(response, "Unable to check database status.")),
      apiFetch("/api/timetable/quality").then((response) => readResponse(response, "Unable to load timetable status.")),
    ]).then(([inventoryResult, databaseResult, qualityResult]) => {
      if (cancelled) return;
      if (inventoryResult.status === "fulfilled") {
        setInventory(inventoryResult.value.rooms || []);
        setInventoryError("");
      } else {
        setInventoryError(inventoryResult.reason?.message || "Room inventory is temporarily unavailable.");
      }
      if (databaseResult.status === "fulfilled") {
        setDatabaseStatus(databaseResult.value.connected === true);
      } else {
        setDatabaseStatus(false);
      }
      if (qualityResult.status === "fulfilled") {
        setQuality({ ...qualityResult.value, ...qualityResult.value.summary });
        setQualityError("");
      } else {
        setQualityError(qualityResult.reason?.message || "Timetable status is temporarily unavailable.");
      }
    });

    return () => { cancelled = true; };
  }, [user]);

  function requestRoom(room) {
    setSelectedRequestRoom(room);
    setActiveView("transfers");
  }
const privateViews = new Set(["search", "transfers", "allocation", "admin"]);
  

  return (
    <div className="app">
      <Header activeView={activeView} setActiveView={setActiveView} user={user} onLogout={handleLogout} />
      <main className="main-content">
        {user && inventoryError && <Alert variant="error">{inventoryError}</Alert>}
        {activeView === "login" && <LoginPage onLogin={(nextUser) => { setUser(nextUser); setActiveView("dashboard"); }} />}
        {!user && privateViews.has(activeView) && <AuthGate onNavigateToLogin={() => setActiveView("login")} />}
        {user && activeView === "dashboard" && <Dashboard setActiveView={setActiveView} quality={quality} inventory={inventory} databaseStatus={databaseStatus} />}
        {user && activeView === "search" && <ClassroomSearch onRequest={requestRoom} />}
        {user && activeView === "transfers" && <RoomTransfers inventory={inventory} initialRoom={selectedRequestRoom} setActiveView={setActiveView} />}
        {user && activeView === "allocation" && <EventAllocation />}
        {user?.role === "ADMIN" && activeView === "admin" && <AdminDashboard />}
        {user && user.role !== "ADMIN" && activeView === "admin" && <Alert variant="error">Administrator access is required for this page.</Alert>}
      </main>
      <footer className="site-footer">
        <span>Smart Classroom &amp; Blackboard Classroom Allocation System</span>
        <span>Evidence-first room services</span>
      </footer>
    </div>
  );
}

export default App;
