
import { useState, useEffect, useCallback } from "react";
import "./AdminDashboard.css";

const API_URL = "http://localhost:5000/api";

export default function AdminDashboard({ onLogout }) {
  const [stats, setStats] = useState({
    students: 0,
    events: 0,
    registrations: 0,
    eventStatuses: [],
  });

  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [eventFilter, setEventFilter] = useState("needs_review");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Centralized authenticated API request
  const apiRequest = useCallback(async (url, options = {}) => {
    const token = sessionStorage.getItem("eventRaiderToken");

    if (!token) {
      throw new Error("Authentication token missing. Please log in again.");
    }

    let response;

    try {
      response = await fetch(`${API_URL}${url}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      throw new Error(
        "Cannot connect to backend. Check that your Node.js server is running."
      );
    }

    const responseText = await response.text();
    let data = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`Invalid server response. HTTP ${response.status}`);
    }

    if (response.status === 401) {
      throw new Error(
        `Authentication failed: ${data.message || "Invalid or expired token."}`
      );
    }

    if (response.status === 403) {
      throw new Error(
        `Access denied: ${data.message || "Admin access required."}`
      );
    }

    if (!response.ok || data.success === false) {
      throw new Error(
        `API Error ${response.status}: ${data.message || "Request failed."}`
      );
    }

    return data;
  }, []);

  // Dashboard statistics
  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const data = await apiRequest("/admin/dashboard");

      setStats({
        students: Number(data.statistics?.students) || 0,
        events: Number(data.statistics?.events) || 0,
        registrations: Number(data.statistics?.registrations) || 0,
        eventStatuses: data.statistics?.eventStatuses || [],
      });
    } catch (err) {
      setError(err.message);
      console.error("Dashboard API error:", err);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  // Event listing
  const fetchEvents = useCallback(async (status) => {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const data = await apiRequest(
        `/admin/events?status=${encodeURIComponent(status)}`
      );

      setEvents(data.events || []);
    } catch (err) {
      setError(err.message);
      setEvents([]);
      console.error("Events API error:", err);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  // Approve or expire an event
  const updateEventStatus = async (id, status) => {
    try {
      setError("");
      setMessage("");

      const data = await apiRequest(`/admin/events/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setMessage(data.message || "Event status updated successfully.");

      await fetchEvents(eventFilter);
      await fetchDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  // Load dashboard on component mount
  useEffect(() => {
    if (!sessionStorage.getItem("eventRaiderToken")) {
      setError("Authentication token missing. Please log in again.");
      return;
    }

    fetchDashboard();
  }, [fetchDashboard]);

  // Load events when tab or filter changes
  useEffect(() => {
    if (activeTab === "events") {
      fetchEvents(eventFilter);
    }
  }, [activeTab, eventFilter, fetchEvents]);

  // Status count helper
  const getStatusCount = (status) => {
    const item = stats.eventStatuses.find(
      (entry) => entry.event_status === status
    );

    return Number(item?.total) || 0;
  };

  // Logout
  const handleLogout = () => {
    sessionStorage.removeItem("eventRaiderToken");
    sessionStorage.removeItem("eventRaiderUser");

    if (onLogout) {
      onLogout();
    } else {
      window.location.reload();
    }
  };

  // Refresh
  const handleRefresh = () => {
    if (activeTab === "overview") {
      fetchDashboard();
    } else {
      fetchEvents(eventFilter);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-navbar">
        <a href="/" className="admin-logo">
          <span className="admin-logo-icon">✦</span>
          Event <span>Raider</span>
        </a>

        <div className="admin-nav-right">
          <span className="admin-role">Administrator</span>
          <button className="admin-logout" onClick={handleLogout}>
            Logout ↗
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <span className="admin-eyebrow">CONTROL CENTER</span>
            <h1>Admin Dashboard</h1>
            <p>Manage students, events and registrations.</p>
          </div>

          <button
            className="admin-refresh"
            onClick={handleRefresh}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>

        <nav className="admin-tabs">
          <button
            className={activeTab === "overview" ? "active" : ""}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>

          <button
            className={activeTab === "events" ? "active" : ""}
            onClick={() => setActiveTab("events")}
          >
            Event Management
          </button>
        </nav>

        {error && (
          <div className="admin-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {message && (
          <div className="admin-success">
            {message}
          </div>
        )}

        {activeTab === "overview" && (
          <>
            {loading ? (
              <div className="admin-loading">Loading dashboard...</div>
            ) : (
              <>
                <section className="admin-stats">
                  <div className="admin-stat-card">
                    <span className="admin-stat-icon">👨‍🎓</span>
                    <p>Total Students</p>
                    <h2>{stats.students}</h2>
                  </div>

                  <div className="admin-stat-card">
                    <span className="admin-stat-icon">📅</span>
                    <p>Total Events</p>
                    <h2>{stats.events}</h2>
                  </div>

                  <div className="admin-stat-card">
                    <span className="admin-stat-icon">📝</span>
                    <p>Registrations</p>
                    <h2>{stats.registrations}</h2>
                  </div>

                  <div className="admin-stat-card">
                    <span className="admin-stat-icon">⏳</span>
                    <p>Pending Review</p>
                    <h2>{getStatusCount("needs_review")}</h2>
                  </div>
                </section>

                <section className="admin-section">
                  <span className="admin-eyebrow">EVENT MANAGEMENT</span>
                  <h2>Event Status</h2>

                  <div className="admin-status-grid">
                    <div className="admin-status-card">
                      <span className="status-indicator upcoming" />
                      <div>
                        <p>Upcoming Events</p>
                        <h3>{getStatusCount("upcoming")}</h3>
                      </div>
                    </div>

                    <div className="admin-status-card">
                      <span className="status-indicator review" />
                      <div>
                        <p>Needs Review</p>
                        <h3>{getStatusCount("needs_review")}</h3>
                      </div>
                    </div>

                    <div className="admin-status-card">
                      <span className="status-indicator expired" />
                      <div>
                        <p>Expired Events</p>
                        <h3>{getStatusCount("expired")}</h3>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {activeTab === "events" && (
          <section className="admin-section">
            <span className="admin-eyebrow">EVENT CONTROL</span>
            <h2>Manage College Events</h2>

            <div className="admin-filters">
              {["needs_review", "upcoming", "expired"].map((status) => (
                <button
                  key={status}
                  className={eventFilter === status ? "active" : ""}
                  onClick={() => setEventFilter(status)}
                >
                  {status === "needs_review"
                    ? "Pending Review"
                    : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="admin-loading">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="admin-info-card">
                <h3>No events found</h3>
                <p>There are no events in this category.</p>
              </div>
            ) : (
              <div className="admin-event-list">
                {events.map((event) => (
                  <article className="admin-event-card" key={event.id}>
                    <div className="admin-event-details">
                      <span className="admin-eyebrow">
                        {event.category || "College Event"}
                      </span>

                      <h3>{event.title}</h3>
                      <p>{event.college}</p>

                      {event.event_date && (
                        <p>📅 {String(event.event_date).slice(0, 10)}</p>
                      )}

                      {event.location && <p>📍 {event.location}</p>}

                      <span className="admin-event-status">
                        {event.event_status}
                      </span>

                      {event.source_url && (
                        <p>
                          <a
                            href={event.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View source ↗
                          </a>
                        </p>
                      )}

                      {event.registration_url && (
                        <p>
                          <a
                            href={event.registration_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Registration link ↗
                          </a>
                        </p>
                      )}
                    </div>

                    <div className="admin-event-actions">
                      {event.event_status !== "upcoming" && (
                        <button
                          className="admin-approve"
                          onClick={() =>
                            updateEventStatus(event.id, "upcoming")
                          }
                        >
                          Approve
                        </button>
                      )}

                      {event.event_status !== "expired" && (
                        <button
                          className="admin-expire"
                          onClick={() =>
                            updateEventStatus(event.id, "expired")
                          }
                        >
                          Mark Expired
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
