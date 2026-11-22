
import { useState, useEffect } from "react";
import "./App.css";
import AdminDashboard from "./components/AdminDashboard";

const API_URL = (
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api"
).replace(/\/$/, "");

const CATEGORIES = [
  "All Events",
  "Technical",
  "Cultural",
  "Workshop",
  "Hackathon",
  "Conference",
  "Other",
];

function getEventLink(event) {
  const isValidUrl = (value) => {
    if (!value || typeof value !== "string") return false;

    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  };

  const registrationUrl = event.registration_url?.trim();
  const officialEventUrl = event.source_url?.trim();

  if (isValidUrl(registrationUrl)) {
    return {
      url: registrationUrl,
      label: "Official Registration ↗",
    };
  }

  if (isValidUrl(officialEventUrl)) {
    return {
      url: officialEventUrl,
      label: "Official Event Page ↗",
    };
  }

  return null;
}

function getCategory(event) {
  const text = `${event.category || ""} ${event.title || ""}`.toLowerCase();

  if (text.includes("hackathon")) return "Hackathon";
  if (text.includes("workshop")) return "Workshop";

  if (
    text.includes("conference") ||
    text.includes("symposium")
  ) {
    return "Conference";
  }

  if (
    text.includes("cultural") ||
    text.includes("fest") ||
    text.includes("festival")
  ) {
    return "Cultural";
  }

  if (
    text.includes("technical") ||
    text.includes("technology") ||
    text.includes("coding") ||
    text.includes("techno")
  ) {
    return "Technical";
  }

  return "Other";
}

// Correct date formatting for India (IST)
function formatDate(value) {
  if (!value) {
    return "Date to be announced";
  }

  let date;

  // Handle MySQL DATE format: YYYY-MM-DD
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    const [year, month, day] = value.split("-").map(Number);

    date = new Date(
      year,
      month - 1,
      day,
      12,
      0,
      0
    );
  } else {
    // Handle ISO timestamps returned by the backend
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return "Date to be announced";
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function App() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Events");

  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState("");

  const [registeringEvent, setRegisteringEvent] = useState(null);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [registrationError, setRegistrationError] = useState(false);

  const [myRegistrations, setMyRegistrations] = useState([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [registrationsError, setRegistrationsError] = useState("");
  const [showMyRegistrations, setShowMyRegistrations] = useState(false);

  // Authentication states
  const [authMode, setAuthMode] = useState(null);
  const [loginRole, setLoginRole] = useState("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState(false);

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("eventRaiderUser")
      ) || null;
    } catch {
      return null;
    }
  });

  // Load public events
  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      setLoadingEvents(true);
      setEventsError("");

      try {
        const response = await fetch(`${API_URL}/events`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load events from the server.");
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || "Failed to load events.");
        }

        if (!cancelled) {
          setEvents(
            Array.isArray(data.events) ? data.events : []
          );
        }
      } catch (error) {
        if (!cancelled) {
          setEventsError(
            "Could not load events. Make sure your backend and MySQL are running."
          );

          console.error("Event loading error:", error);
        }
      } finally {
        if (!cancelled) {
          setLoadingEvents(false);
        }
      }
    }

    fetchEvents();

    return () => {
      cancelled = true;
    };
  }, []);

  // Scroll to My Registrations when opened
  useEffect(() => {
    if (!showMyRegistrations) return;

    const timer = setTimeout(() => {
      document.getElementById("my-registrations")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [showMyRegistrations]);

  // Fetch student's registrations
  async function fetchMyRegistrations() {
    const token = sessionStorage.getItem("eventRaiderToken");

    if (!token) {
      setRegistrationsError(
        "Please log in again to view your registrations."
      );
      return;
    }

    setLoadingRegistrations(true);
    setRegistrationsError("");

    try {
      const response = await fetch(`${API_URL}/registrations/my`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load your registrations."
        );
      }

      setMyRegistrations(
        Array.isArray(data.registrations)
          ? data.registrations
          : []
      );
    } catch (error) {
      setRegistrationsError(
        error.message || "Unable to load your registrations."
      );
    } finally {
      setLoadingRegistrations(false);
    }
  }

  // Open or close My Registrations
  async function toggleMyRegistrations() {
    if (!user) {
      openAuth("login");
      return;
    }

    if (user.role !== "student") return;

    const shouldOpen = !showMyRegistrations;

    setShowMyRegistrations(shouldOpen);

    if (shouldOpen) {
      await fetchMyRegistrations();
    }
  }

  // Register student for an event
  async function handleEventRegistration(eventId) {
    if (!user) {
      openAuth("login");
      return;
    }

    if (user.role !== "student") {
      setRegistrationError(true);
      setRegistrationMessage(
        "Only student accounts can register for events."
      );
      return;
    }

    const token = sessionStorage.getItem("eventRaiderToken");

    if (!token) {
      setRegistrationError(true);
      setRegistrationMessage("Please log in again to register.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to register for this event?\n\n" +
      "Click OK to confirm or Cancel to go back."
    );

    if (!confirmed) return;

    setRegisteringEvent(eventId);
    setRegistrationMessage("");
    setRegistrationError(false);

    try {
      const response = await fetch(
        `${API_URL}/registrations/${eventId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Registration failed.");
      }

      setRegistrationMessage(
        `Successfully registered for ${
          data.event?.title || "this event"
        }! Check your email for confirmation.`
      );

      if (showMyRegistrations) {
        await fetchMyRegistrations();
      }
    } catch (error) {
      setRegistrationError(true);

      setRegistrationMessage(
        error.message || "Unable to register. Please try again."
      );
    } finally {
      setRegisteringEvent(null);
    }
  }

  // Search and category filtering
  const filteredEvents = events.filter((event) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      !query ||
      [
        event.title,
        event.college,
        event.category,
        event.location,
      ].some((value) =>
        String(value || "").toLowerCase().includes(query)
      );

    const eventCategory = getCategory(event);

    const matchesCategory =
      category === "All Events" ||
      eventCategory === category;

    return matchesSearch && matchesCategory;
  });

  // Open authentication modal
  function openAuth(mode) {
    setAuthMode(mode);
    setLoginRole("student");
    setName("");
    setEmail("");
    setPassword("");
    setAuthMessage("");
    setAuthError(false);
  }

  // Close authentication modal
  function closeAuth() {
    if (authLoading) return;

    setAuthMode(null);
    setAuthMessage("");
  }

  // Login and registration
  async function handleAuthSubmit(event) {
    event.preventDefault();

    setAuthLoading(true);
    setAuthMessage("");
    setAuthError(false);

    try {
      const isRegister = authMode === "register";

      const endpoint = isRegister
        ? "/auth/register"
        : "/auth/login";

      const payload = isRegister
        ? {
            name: name.trim(),
            email: email.trim(),
            password,
          }
        : {
            email: email.trim(),
            password,
          };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Authentication failed."
        );
      }

      if (!data.user) {
        throw new Error(
          "User information was not returned by the server."
        );
      }

      // Verify selected login type against backend account role
      if (!isRegister && data.user.role !== loginRole) {
        throw new Error(
          `This account is not registered as a ${loginRole}. Please select the correct login type.`
        );
      }

      if (!isRegister && !data.token) {
        throw new Error(
          "Login succeeded but the server did not return an authentication token."
        );
      }

      if (!isRegister) {
        sessionStorage.setItem(
          "eventRaiderToken",
          data.token
        );
      }

      sessionStorage.setItem(
        "eventRaiderUser",
        JSON.stringify(data.user)
      );

      setUser(data.user);

      setAuthMessage(
        isRegister
          ? "Account created successfully!"
          : "Login successful!"
      );

      setTimeout(() => {
        setAuthMode(null);
        setAuthMessage("");
      }, 700);
    } catch (error) {
      setAuthError(true);

      setAuthMessage(
        error.message || "Something went wrong. Please try again."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  // Logout
  function handleLogout() {
    sessionStorage.removeItem("eventRaiderUser");
    sessionStorage.removeItem("eventRaiderToken");

    setUser(null);
    setMyRegistrations([]);
    setShowMyRegistrations(false);
    setRegistrationsError("");
  }

  // Admin dashboard
  if (user?.role === "admin") {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="navbar">
        <a className="logo" href="#home">
          <span className="logo-icon">✦</span>
          Event<span>Raider</span>
        </a>

        <div className="nav-links">
          <a href="#home">Home</a>
          <a href="#events">Explore Events</a>
          <a href="#about">About</a>

          {user?.role === "student" && (
            <button
              type="button"
              className="nav-link-button"
              onClick={toggleMyRegistrations}
              aria-expanded={showMyRegistrations}
            >
              My Registrations
            </button>
          )}
        </div>

        <div className="nav-actions">
          {user ? (
            <>
              <span className="welcome-user">
                Hi, {user.name || user.email}
              </span>

              <button
                className="btn btn-outline"
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-outline"
                onClick={() => openAuth("login")}
              >
                Login
              </button>

              <button
                className="btn btn-primary"
                onClick={() => openAuth("register")}
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="hero" id="home">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="status-dot" />
              YOUR CAMPUS. YOUR EVENTS.
            </div>

            <h1>
              Discover Events.
              <br />
              <span>Make Memories.</span>
            </h1>

            <p className="hero-description">
              Find college fests, hackathons, workshops and conferences
              from colleges around Bengaluru — all in one place.
            </p>

            <div className="hero-actions">
              <a
                href="#events"
                className="btn btn-primary btn-large"
              >
                Explore Events <span>→</span>
              </a>

              {!user && (
                <button
                  className="btn btn-outline btn-large"
                  onClick={() => openAuth("register")}
                >
                  Join Event Raider
                </button>
              )}
            </div>

            <div className="hero-stats">
              <div>
                <strong>{events.length}+</strong>
                <span>Events discovered</span>
              </div>

              <div className="stat-divider" />

              <div>
                <strong>26+</strong>
                <span>College sources</span>
              </div>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />

            <div className="hero-art-card art-card-one">
              <span className="art-emoji">💻</span>
              <span>Hackathons</span>
            </div>

            <div className="hero-art-card art-card-two">
              <span className="art-emoji">🎸</span>
              <span>College Fests</span>
            </div>

            <div className="hero-art-card art-card-three">
              <span className="art-emoji">🚀</span>
              <span>Workshops</span>
            </div>

            <div className="hero-center">
              <span>✦</span>
              <strong>ER</strong>
              <small>FIND YOUR NEXT</small>
              <small>BIG THING</small>
            </div>
          </div>
        </section>

        {/* My Registrations Section */}
        {showMyRegistrations && user?.role === "student" && (
          <section
            className="events-section"
            id="my-registrations"
          >
            <div className="section-heading">
              <div>
                <span className="section-eyebrow">
                  YOUR EVENT ACTIVITY
                </span>
                <h2>My Registrations</h2>
                <p>
                  Keep track of the events you have registered for.
                </p>
              </div>

              <button
                className="btn btn-outline"
                onClick={fetchMyRegistrations}
                disabled={loadingRegistrations}
              >
                {loadingRegistrations
                  ? "Refreshing..."
                  : "↻ Refresh"}
              </button>
            </div>

            {loadingRegistrations ? (
              <div className="events-state">
                <div className="loading-spinner" />
                <h3>Loading your registrations...</h3>
              </div>
            ) : registrationsError ? (
              <div className="events-state">
                <div className="state-icon">⚠️</div>
                <h3>Unable to load registrations</h3>
                <p>{registrationsError}</p>

                <button
                  className="btn btn-primary"
                  onClick={fetchMyRegistrations}
                >
                  Try Again
                </button>
              </div>
            ) : myRegistrations.length === 0 ? (
              <div className="events-state">
                <div className="state-icon">✦</div>
                <h3>No registrations yet</h3>

                <p>
                  You have not registered for any events. Explore
                  events and register for your favourites!
                </p>

                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setShowMyRegistrations(false);

                    document.getElementById("events")?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                >
                  Explore Events
                </button>
              </div>
            ) : (
              <>
                <div className="events-count">
                  {myRegistrations.length} registered event(s)
                </div>

                <div className="events-grid">
                  {myRegistrations.map((registration) => {
                    const link = getEventLink(registration);

                    return (
                      <article
                        className="event-card"
                        key={registration.registration_id}
                      >
                        <div className="event-card-top">
                          <span className="event-category">
                            {registration.category || "Event"}
                          </span>

                          <span className="event-symbol">✦</span>
                        </div>

                        <h3 className="event-title">
                          {registration.title}
                        </h3>

                        <p className="event-college">
                          <span aria-hidden="true">⌂</span>
                          {registration.college ||
                            "College not specified"}
                        </p>

                        <div className="event-meta">
                          <span>
                            <span aria-hidden="true">▦</span>
                            {formatDate(registration.event_date)}
                          </span>

                          {registration.location && (
                            <span>
                              <span aria-hidden="true">⌖</span>
                              {registration.location}
                            </span>
                          )}
                        </div>

                        <p className="registration-status">
                          Status:{" "}
                          <strong>
                            {registration.registration_status ||
                              "registered"}
                          </strong>
                        </p>

                        {link ? (
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="event-register-btn"
                          >
                            {link.label}
                          </a>
                        ) : (
                          <span className="event-link-unavailable">
                            Official link unavailable
                          </span>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            <button
              className="btn btn-outline"
              onClick={() => setShowMyRegistrations(false)}
              style={{ marginTop: "25px" }}
            >
              Close My Registrations
            </button>
          </section>
        )}

        {/* Events Section */}
        <section className="events-section" id="events">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">
                EXPLORE OPPORTUNITIES
              </span>
              <h2>Discover campus events</h2>
              <p>
                Find your next hackathon, workshop, fest or conference.
              </p>
            </div>

            <span className="events-count">
              {filteredEvents.length} events found
            </span>
          </div>

          <div className="event-controls">
            <div className="search-box">
              <span className="search-icon">⌕</span>

              <input
                type="text"
                placeholder="Search events, colleges..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search events"
              />

              {search && (
                <button
                  className="clear-search"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="category-filters">
              {CATEGORIES.map((item) => (
                <button
                  key={item}
                  className={`category-chip ${
                    category === item ? "active" : ""
                  }`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {loadingEvents ? (
            <div className="events-state">
              <div className="loading-spinner" />
              <h3>Finding events for you...</h3>
              <p>Loading events from college websites.</p>
            </div>
          ) : eventsError ? (
            <div className="events-state">
              <div className="state-icon">⚠️</div>
              <h3>Unable to load events</h3>
              <p>{eventsError}</p>

              <button
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Try Again
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="events-state">
              <div className="state-icon">✦</div>

              <h3>
                {events.length === 0
                  ? "No upcoming events found"
                  : "No matching events"}
              </h3>

              <p>
                {events.length === 0
                  ? "Check back later as we discover more official college events."
                  : "Try another search term or category."}
              </p>

              {(search || category !== "All Events") && (
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setSearch("");
                    setCategory("All Events");
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="events-grid">
              {filteredEvents.map((event) => {
                const link = getEventLink(event);
                const eventCategory = getCategory(event);

                return (
                  <article className="event-card" key={event.id}>
                    <div className="event-card-top">
                      <span className="event-category">
                        {eventCategory}
                      </span>

                      <span className="event-symbol">✦</span>
                    </div>

                    <h3 className="event-title">{event.title}</h3>

                    <p className="event-college">
                      <span aria-hidden="true">⌂</span>
                      {event.college || "College not specified"}
                    </p>

                    <div className="event-meta">
                      <span>
                        <span aria-hidden="true">▦</span>
                        {formatDate(event.event_date)}
                      </span>

                      {event.location && (
                        <span>
                          <span aria-hidden="true">⌖</span>
                          {event.location}
                        </span>
                      )}
                    </div>

                    <div className="event-card-footer">
                      <button
                        type="button"
                        className="event-register-btn"
                        onClick={() =>
                          handleEventRegistration(event.id)
                        }
                        disabled={registeringEvent === event.id}
                      >
                        {registeringEvent === event.id
                          ? "Registering..."
                          : "Register Now"}
                      </button>

                      {link ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="event-register-btn"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <span className="event-link-unavailable">
                          Official link unavailable
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {registrationMessage && (
            <div
              className={`auth-message ${
                registrationError ? "error" : "success"
              }`}
              role="status"
              aria-live="polite"
            >
              {registrationMessage}
            </div>
          )}
        </section>

        {/* About Section */}
        <section className="about-section" id="about">
          <div className="about-content">
            <span className="section-eyebrow">
              ABOUT EVENT RAIDER
            </span>

            <h2>Your campus life, all in one place.</h2>

            <p>
              Event Raider brings college events together so students
              can discover opportunities beyond their own campus.
              Explore events and follow official college links for
              registration and further information.
            </p>

            <a href="#events" className="btn btn-primary">
              Find Your Next Event →
            </a>
          </div>

          <div className="about-visual" aria-hidden="true">
            <div className="about-visual-inner">
              <span>✦</span>
              <strong>Discover.</strong>
              <strong>Connect.</strong>
              <strong>Experience.</strong>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <a className="logo" href="#home">
          <span className="logo-icon">✦</span>
          Event<span>Raider</span>
        </a>

        <p>Discover your next campus experience.</p>

        <div className="footer-links">
          <a href="#home">Home</a>
          <a href="#events">Events</a>
          <a href="#about">About</a>
        </div>

        <span className="footer-copy">
          © {new Date().getFullYear()} Event Raider
        </span>
      </footer>

      {/* Authentication Modal */}
      {authMode && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAuth();
            }
          }}
        >
          <div
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeAuth}
              disabled={authLoading}
              aria-label="Close"
            >
              ×
            </button>

            <div className="modal-logo">✦</div>

            <span className="section-eyebrow">
              WELCOME TO EVENT RAIDER
            </span>

            <h2 id="auth-title">
              {authMode === "register"
                ? "Create your account"
                : "Welcome back"}
            </h2>

            <p className="modal-description">
              {authMode === "register"
                ? "Join the community and discover campus events."
                : "Choose your account type to continue."}
            </p>

            {/* Student / Admin selection - login only */}
            {authMode === "login" && (
              <div className="login-role-selection">
                <button
                  type="button"
                  className={`role-option ${
                    loginRole === "student" ? "active" : ""
                  }`}
                  onClick={() => setLoginRole("student")}
                  aria-pressed={loginRole === "student"}
                >
                  <span className="role-icon">🎓</span>
                  <strong>Student</strong>
                  <small>Student account</small>
                </button>

                <button
                  type="button"
                  className={`role-option ${
                    loginRole === "admin" ? "active" : ""
                  }`}
                  onClick={() => setLoginRole("admin")}
                  aria-pressed={loginRole === "admin"}
                >
                  <span className="role-icon">🛡️</span>
                  <strong>Admin</strong>
                  <small>Administrator account</small>
                </button>
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              {authMode === "register" && (
                <label className="form-field">
                  <span>Full name</span>

                  <input
                    type="text"
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    placeholder="Enter your name"
                    autoComplete="name"
                    required
                  />
                </label>
              )}

              <label className="form-field">
                <span>Email address</span>

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="form-field">
                <span>Password</span>

                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete={
                    authMode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                  minLength={
                    authMode === "register" ? 8 : undefined
                  }
                  required
                />
              </label>

              {authMessage && (
                <p
                  className={`auth-message ${
                    authError ? "error" : "success"
                  }`}
                >
                  {authMessage}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary auth-submit"
                disabled={authLoading}
              >
                {authLoading
                  ? "Please wait..."
                  : authMode === "register"
                  ? "Create Account"
                  : `Login as ${
                      loginRole === "admin" ? "Admin" : "Student"
                    }`}
              </button>
            </form>

            <p className="auth-switch">
              {authMode === "register"
                ? "Already have an account?"
                : "Don't have an account?"}{" "}

              <button
                type="button"
                onClick={() =>
                  openAuth(
                    authMode === "register" ? "login" : "register"
                  )
                }
                disabled={authLoading}
              >
                {authMode === "register" ? "Login" : "Sign Up"}
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
