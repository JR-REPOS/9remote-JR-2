import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Cpu,
  Globe,
  Key,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Activity,
  Eye,
  EyeOff,
  Radio,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import { CustomAIProvider } from "../types";
import {
  getCustomProviders,
  saveCustomProvider,
  deleteCustomProvider,
  getActiveCustomProviderId,
  setActiveCustomProviderId,
  testProviderConnection,
  updateProviderValidation,
  PROVIDER_PRESETS,
  ProviderPreset,
} from "../lib/providers";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProvidersChanged?: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onProvidersChanged,
}: SettingsModalProps) {
  const [providers, setProviders] = useState<CustomAIProvider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Status & Feedback
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    ok: boolean;
    message?: string;
    error?: string;
    latency?: number;
  } | null>(null);
  const [validatingSavedId, setValidatingSavedId] = useState<string | null>(null);
  const [savedValidationResults, setSavedValidationResults] = useState<
    Record<string, { ok: boolean; message?: string; error?: string; latency?: number }>
  >({});

  // Load existing providers
  useEffect(() => {
    if (isOpen) {
      const saved = getCustomProviders();
      setProviders(saved);
      setActiveId(getActiveCustomProviderId());
      setFormError(null);
      setSuccessMessage(null);
      setValidationResult(null);
    }
  }, [isOpen]);

  // Handle ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(null);
    setProviderName("");
    setBaseUrl("");
    setApiKey("");
    setModelId("");
    setShowKey(false);
    setFormError(null);
    setValidationResult(null);
  };

  const applyPreset = (preset: ProviderPreset) => {
    setProviderName(preset.name);
    setBaseUrl(preset.baseUrl);
    setModelId(preset.modelId);
    setFormError(null);
    setValidationResult(null);
    if (!preset.requiresKey && !apiKey) {
      setApiKey("");
    }
  };

  const handleEdit = (provider: CustomAIProvider) => {
    setEditingId(provider.id);
    setProviderName(provider.name);
    setBaseUrl(provider.baseUrl);
    setApiKey(provider.apiKey);
    setModelId(provider.modelId);
    setFormError(null);
    setValidationResult(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete provider "${name}"?`)) {
      const updated = deleteCustomProvider(id);
      setProviders(updated);
      if (editingId === id) {
        resetForm();
      }
      setSuccessMessage(`Provider "${name}" deleted`);
      setTimeout(() => setSuccessMessage(null), 3000);
      onProvidersChanged?.();
    }
  };

  const handleSetActive = (id: string | null) => {
    setActiveCustomProviderId(id);
    setActiveId(id);
    onProvidersChanged?.();
  };

  const handleValidate = async () => {
    if (!baseUrl.trim()) {
      setFormError("Base URL is required to validate connection.");
      return;
    }
    if (!modelId.trim()) {
      setFormError("Model ID is required to validate connection.");
      return;
    }

    try {
      new URL(baseUrl.trim());
    } catch {
      setFormError("Base URL must be a valid URL (e.g. https://api.openai.com/v1).");
      return;
    }

    setFormError(null);
    setIsValidating(true);
    setValidationResult(null);

    const result = await testProviderConnection({
      name: providerName.trim() || "Test Provider",
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      modelId: modelId.trim(),
    });

    setIsValidating(false);
    setValidationResult(result);
  };

  const handleValidateSaved = async (provider: CustomAIProvider) => {
    setValidatingSavedId(provider.id);
    const result = await testProviderConnection({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelId: provider.modelId,
    });
    setValidatingSavedId(null);
    setSavedValidationResults((prev) => ({
      ...prev,
      [provider.id]: result,
    }));
    const updated = updateProviderValidation(provider.id, result);
    setProviders(updated);
    onProvidersChanged?.();
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!providerName.trim()) {
      setFormError("Please enter a Provider Name.");
      return;
    }
    if (!baseUrl.trim()) {
      setFormError("Please enter a valid Base URL.");
      return;
    }
    if (!modelId.trim()) {
      setFormError("Please enter a Model ID.");
      return;
    }

    // Basic URL check
    try {
      new URL(baseUrl.trim());
    } catch {
      setFormError("Base URL must be a valid URL (e.g. https://api.openai.com/v1).");
      return;
    }

    const existingProvider = editingId ? providers.find((p) => p.id === editingId) : undefined;
    const provider: CustomAIProvider = {
      id: editingId || `provider-${Date.now()}`,
      name: providerName.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      modelId: modelId.trim(),
      lastValidation: validationResult
        ? { ...validationResult, timestamp: Date.now() }
        : existingProvider?.lastValidation,
    };

    const updated = saveCustomProvider(provider);
    setProviders(updated);

    // Auto-select as active if it's the first or user was editing the active one
    if (!activeId || activeId === provider.id) {
      handleSetActive(provider.id);
    }

    setSuccessMessage(
      editingId ? `Provider "${provider.name}" updated!` : `Provider "${provider.name}" saved successfully!`
    );
    setTimeout(() => setSuccessMessage(null), 3500);

    resetForm();
    onProvidersChanged?.();
  };

  const maskKey = (key: string) => {
    if (!key) return "No key configured (local)";
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  };

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div
        className="settings-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        {/* Modal Header */}
        <div className="settings-modal-header">
          <div className="settings-header-title-wrap">
            <div className="settings-header-icon">
              <Cpu size={18} />
            </div>
            <div>
              <h2 id="settings-modal-title" className="settings-modal-title">
                Custom AI Providers
              </h2>
              <p className="settings-modal-subtitle">
                Configure OpenAI-compatible, Ollama, Groq, OpenRouter, or local LLM endpoints
              </p>
            </div>
          </div>
          <button
            className="settings-close-btn"
            onClick={onClose}
            aria-label="Close settings"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <div className="settings-modal-body">
          {/* Notifications */}
          {successMessage && (
            <div className="settings-banner success">
              <CheckCircle2 size={16} />
              <span>{successMessage}</span>
            </div>
          )}
          {formError && (
            <div className="settings-banner error">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* Form Card */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-title">
                <Sparkles size={15} color="var(--brand-500)" />
                <span>{editingId ? "Edit AI Provider" : "Add Custom AI Provider"}</span>
              </div>
              {editingId && (
                <button className="settings-text-btn" onClick={resetForm}>
                  Cancel Edit
                </button>
              )}
            </div>

            {/* Presets Chips */}
            <div className="preset-selector-row">
              <span className="preset-label">Quick Presets:</span>
              <div className="preset-chips">
                {PROVIDER_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="preset-chip"
                    onClick={() => applyPreset(p)}
                    title={p.hint}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSave} className="settings-form">
              <div className="form-grid">
                {/* Provider Name */}
                <div className="form-group">
                  <label htmlFor="provider-name" className="form-label">
                    <Cpu size={13} />
                    Provider Name <span className="req">*</span>
                  </label>
                  <input
                    id="provider-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. OpenAI, Local Ollama, Groq Fast"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    required
                  />
                  <span className="form-hint">Display label for model selector</span>
                </div>

                {/* Model ID */}
                <div className="form-group">
                  <label htmlFor="provider-model" className="form-label">
                    <Layers size={13} />
                    Model ID <span className="req">*</span>
                  </label>
                  <input
                    id="provider-model"
                    type="text"
                    className="form-input"
                    placeholder="e.g. gpt-4o, llama3.2, deepseek-chat"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    required
                  />
                  <span className="form-hint">Model identifier expected by endpoint</span>
                </div>
              </div>

              {/* Base URL */}
              <div className="form-group full-width">
                <label htmlFor="provider-url" className="form-label">
                  <Globe size={13} />
                  Base URL <span className="req">*</span>
                </label>
                <div className="url-input-wrap">
                  <input
                    id="provider-url"
                    type="text"
                    className="form-input"
                    placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    required
                  />
                </div>
                <span className="form-hint">
                  OpenAI-compatible root API URL (e.g. `https://api.openai.com/v1`, `http://localhost:11434/v1`)
                </span>
              </div>

              {/* API Key */}
              <div className="form-group full-width">
                <label htmlFor="provider-key" className="form-label">
                  <Key size={13} />
                  API Key
                </label>
                <div className="key-input-wrap">
                  <input
                    id="provider-key"
                    type={showKey ? "text" : "password"}
                    className="form-input key-input"
                    placeholder="sk-... (optional for local models like Ollama)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="key-toggle-btn"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="form-hint">
                  Stored securely in your local browser storage. Sent server-side to proxy requests.
                </span>
              </div>

              {/* Validation Result Indicator using existing test-result-box styles */}
              {validationResult && (
                <div
                  id="validation-result-box"
                  className={`test-result-box ${validationResult.ok ? "test-success" : "test-fail"}`}
                >
                  {validationResult.ok ? (
                    <>
                      <CheckCircle2 size={16} />
                      <div className="test-result-text">
                        <strong>Connection verified:</strong> {validationResult.message}
                        {validationResult.latency !== undefined && (
                          <span className="latency-badge">{validationResult.latency}ms</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={16} />
                      <div className="test-result-text">
                        <strong>Validation failed:</strong> {validationResult.error}
                        {validationResult.latency !== undefined && (
                          <span className="latency-badge fail">{validationResult.latency}ms</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Form Buttons */}
              <div className="form-actions">
                <button
                  type="button"
                  id="validate-provider-btn"
                  className="test-btn validate-btn"
                  onClick={handleValidate}
                  disabled={isValidating || !baseUrl.trim() || !modelId.trim()}
                  title="Test connection to custom AI provider by sending a dummy request"
                >
                  {isValidating ? (
                    <>
                      <Activity size={14} className="spin-icon" />
                      <span>Validating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Validate</span>
                    </>
                  )}
                </button>

                <div style={{ display: "flex", gap: 8 }}>
                  {editingId && (
                    <button type="button" className="btn-secondary" onClick={resetForm}>
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="btn-primary">
                    <Check size={14} />
                    {editingId ? "Update Provider" : "Save Provider"}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Saved Providers Section */}
          <div className="saved-providers-section">
            <div className="saved-providers-header">
              <h3 className="saved-providers-title">
                Saved Providers ({providers.length})
              </h3>
              {activeId && (
                <button
                  className="settings-text-btn subtle"
                  onClick={() => handleSetActive(null)}
                  title="Switch back to standard built-in AI models"
                >
                  Clear Active (Use Default Models)
                </button>
              )}
            </div>

            {providers.length === 0 ? (
              <div className="saved-providers-empty">
                <Cpu size={28} style={{ opacity: 0.3 }} />
                <div>No custom providers saved yet.</div>
                <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                  Use the form above or select a preset to configure your custom endpoints.
                </div>
              </div>
            ) : (
              <div className="saved-providers-list">
                {providers.map((p) => {
                  const isActive = p.id === activeId;
                  return (
                    <div
                      key={p.id}
                      className={`provider-item-card ${isActive ? "active" : ""}`}
                    >
                      <div className="provider-card-main">
                        <div className="provider-card-top">
                          <button
                            className={`active-indicator-btn ${isActive ? "active" : ""}`}
                            onClick={() => handleSetActive(isActive ? null : p.id)}
                            title={isActive ? "Currently active in Chat" : "Click to activate for Chat"}
                          >
                            <span className="radio-dot" />
                            <span className="provider-name">{p.name}</span>
                          </button>

                          {/* Visual status indicator (Success/Error icon) to indicate last validation result */}
                          {(() => {
                            const val = savedValidationResults[p.id] || p.lastValidation;
                            if (!val) {
                              return (
                                <span
                                  className="provider-status-badge untested"
                                  title="Not validated yet. Click 'Validate' to test connection."
                                >
                                  <HelpCircle size={12} />
                                  <span>Untested</span>
                                </span>
                              );
                            }
                            return val.ok ? (
                              <span
                                className="provider-status-badge success"
                                title={`Connection verified successfully${
                                  val.latency !== undefined ? ` (${val.latency}ms)` : ""
                                }`}
                              >
                                <CheckCircle2 size={13} />
                                <span>Verified</span>
                                {val.latency !== undefined && (
                                  <span className="badge-ms">{val.latency}ms</span>
                                )}
                              </span>
                            ) : (
                              <span
                                className="provider-status-badge error"
                                title={`Validation failed: ${val.error || "Connection error"}`}
                              >
                                <AlertCircle size={13} />
                                <span>Failed</span>
                              </span>
                            );
                          })()}

                          <span className="provider-model-badge">{p.modelId}</span>
                          {isActive && <span className="active-badge">Active</span>}
                        </div>

                        <div className="provider-card-details">
                          <div className="provider-detail-line">
                            <span className="detail-key">URL:</span>
                            <span className="detail-val" title={p.baseUrl}>
                              {p.baseUrl}
                            </span>
                          </div>
                          <div className="provider-detail-line">
                            <span className="detail-key">Key:</span>
                            <span className="detail-val key">{maskKey(p.apiKey)}</span>
                          </div>
                        </div>

                        {/* Inline validation result for this saved provider */}
                        {savedValidationResults[p.id] && (
                          <div
                            className={`test-result-box ${
                              savedValidationResults[p.id].ok ? "test-success" : "test-fail"
                            }`}
                            style={{ marginTop: 8 }}
                          >
                            {savedValidationResults[p.id].ok ? (
                              <>
                                <CheckCircle2 size={14} />
                                <div className="test-result-text">
                                  <strong>Verified:</strong> {savedValidationResults[p.id].message}
                                  {savedValidationResults[p.id].latency !== undefined && (
                                    <span className="latency-badge">
                                      {savedValidationResults[p.id].latency}ms
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={14} />
                                <div className="test-result-text">
                                  <strong>Validation failed:</strong> {savedValidationResults[p.id].error}
                                  {savedValidationResults[p.id].latency !== undefined && (
                                    <span className="latency-badge fail">
                                      {savedValidationResults[p.id].latency}ms
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="provider-card-actions">
                        <button
                          className="provider-action-btn validate"
                          onClick={() => handleValidateSaved(p)}
                          disabled={validatingSavedId === p.id}
                          title="Validate connection to this saved provider with a dummy request"
                        >
                          {validatingSavedId === p.id ? (
                            <Activity size={12} className="spin-icon" />
                          ) : (
                            <CheckCircle2 size={12} />
                          )}
                          <span>{validatingSavedId === p.id ? "Validating..." : "Validate"}</span>
                        </button>
                        <button
                          className="provider-action-btn edit"
                          onClick={() => handleEdit(p)}
                          title="Edit this provider"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          className="provider-action-btn delete"
                          onClick={() => handleDelete(p.id, p.name)}
                          title="Delete provider"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
