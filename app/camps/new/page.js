"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import SOSButton from "@/components/SOSButton";
import CampLocationPicker from "@/components/CampLocationPicker";
import { SPECIALTIES, validateCamp } from "@/lib/campsData";

const EMPTY = {
  title: "",
  titleBn: "",
  organizer: "",
  organizerBn: "",
  specialties: [],
  startAt: "",
  endAt: "",
  venue: "",
  venueBn: "",
  union: "",
  upazila: "",
  district: "",
  phone: "",
  notes: "",
  notesBn: "",
  isFree: true,
  fee: 0,
};

export default function NewCampPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [coords, setCoords] = useState(null);
  const [passcode, setPasscode] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const toggleSpecialty = (id) => {
    setForm((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(id)
        ? prev.specialties.filter((s) => s !== id)
        : [...prev.specialties, id],
    }));
    setErrors((prev) => ({ ...prev, specialties: undefined }));
  };

  const handleLocation = (next) => {
    setCoords(next);
    setErrors((prev) => ({ ...prev, location: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    // datetime-local gives a local wall-clock string; organizers post from
    // Bangladesh, so the browser's own timezone is the right interpretation.
    const payload = {
      ...form,
      fee: form.isFree ? 0 : Number(form.fee) || 0,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : "",
      endAt: form.endAt ? new Date(form.endAt).toISOString() : "",
      lat: coords?.lat,
      lng: coords?.lng,
    };

    // Same validator the API route runs, so the rules can never drift apart.
    const { valid, errors: clientErrors } = validateCamp(payload);
    if (!valid) {
      setErrors(clientErrors);
      setFormError("Please correct the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/camps", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-camp-passcode": passcode },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 401) {
        setFormError("That organizer passcode is not correct. Ask your coordinator for the current one.");
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setErrors(data.errors || {});
        setFormError(data.error || "Could not publish this camp.");
        setSubmitting(false);
        return;
      }

      router.push(`/map?camp=${data.camp.id}`);
    } catch (err) {
      console.error("Camp submit failed:", err);
      setFormError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  const field = (name, label, labelBn, props = {}) => (
    <div className="camp-form__field">
      <label htmlFor={`camp-${name}`}>
        {label} <span className="camp-form__bn">{labelBn}</span>
        {props.required && <span className="camp-form__req">*</span>}
      </label>
      <input
        id={`camp-${name}`}
        type={props.type || "text"}
        value={form[name]}
        onChange={set(name)}
        placeholder={props.placeholder || ""}
        className={errors[name] ? "has-error" : ""}
      />
      {errors[name] && <span className="camp-form__error">{errors[name]}</span>}
    </div>
  );

  return (
    <>
      <Navbar />
      <main className="camp-form-page">
        <div className="page-container">
          <Link href="/map" className="camp-form__back">
            ← Back to the camp map
          </Link>

          <h1 className="camp-form__title">
            ➕ Post a <span className="text-cyan">Medical Camp</span>
          </h1>
          <p className="camp-form__subtitle">
            নতুন মেডিকেল ক্যাম্পের তথ্য দিন — Announce an NGO camp so villagers nearby can find it on
            the map with its date, time, location and specialist type.
          </p>

          <form onSubmit={handleSubmit} className="camp-form" id="camp-form" noValidate>
            {/* ---- What ---- */}
            <section className="card camp-form__section">
              <h2 className="camp-form__legend">1. What is the camp?</h2>
              <div className="camp-form__grid">
                {field("title", "Camp title", "ক্যাম্পের নাম", {
                  required: true,
                  placeholder: "Free Eye & Cataract Screening Camp",
                })}
                {field("titleBn", "Camp title (Bengali)", "বাংলায় নাম", {
                  placeholder: "বিনামূল্যে চক্ষু পরীক্ষা ক্যাম্প",
                })}
                {field("organizer", "Organizer / NGO", "আয়োজক সংস্থা", {
                  required: true,
                  placeholder: "BRAC Health Programme",
                })}
                {field("organizerBn", "Organizer (Bengali)", "বাংলায় সংস্থা", {
                  placeholder: "ব্র্যাক স্বাস্থ্য কর্মসূচি",
                })}
              </div>

              <div className="camp-form__field">
                <label>
                  Specialist types <span className="camp-form__bn">বিশেষজ্ঞের ধরন</span>
                  <span className="camp-form__req">*</span>
                </label>
                <div className="specialty-chips">
                  {SPECIALTIES.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      className={`specialty-chip ${form.specialties.includes(s.id) ? "active" : ""}`}
                      onClick={() => toggleSpecialty(s.id)}
                      style={
                        form.specialties.includes(s.id)
                          ? { borderColor: s.color, color: s.color }
                          : undefined
                      }
                      id={`form-specialty-${s.id}`}
                    >
                      <span>{s.icon}</span> {s.label} <span className="camp-form__bn">{s.labelBn}</span>
                    </button>
                  ))}
                </div>
                {errors.specialties && <span className="camp-form__error">{errors.specialties}</span>}
              </div>
            </section>

            {/* ---- When ---- */}
            <section className="card camp-form__section">
              <h2 className="camp-form__legend">2. When does it run?</h2>
              <div className="camp-form__grid">
                {field("startAt", "Starts", "শুরু", { required: true, type: "datetime-local" })}
                {field("endAt", "Ends", "শেষ", { required: true, type: "datetime-local" })}
              </div>
              <p className="camp-form__hint">
                Ongoing / Upcoming status is worked out from these times automatically — a camp drops
                off the map on its own once it finishes.
              </p>
            </section>

            {/* ---- Where ---- */}
            <section className="card camp-form__section">
              <h2 className="camp-form__legend">3. Where is it?</h2>
              <CampLocationPicker value={coords} onChange={handleLocation} />
              {errors.location && <span className="camp-form__error">{errors.location}</span>}

              <div className="camp-form__grid" style={{ marginTop: 16 }}>
                {field("venue", "Venue", "স্থান", {
                  required: true,
                  placeholder: "Union Parishad Field",
                })}
                {field("venueBn", "Venue (Bengali)", "বাংলায় স্থান", {
                  placeholder: "ইউনিয়ন পরিষদ মাঠ",
                })}
                {field("union", "Union", "ইউনিয়ন", { placeholder: "Sreepur" })}
                {field("upazila", "Upazila", "উপজেলা", { placeholder: "Sreepur" })}
                {field("district", "District", "জেলা", { required: true, placeholder: "Gazipur" })}
                {field("phone", "Contact phone", "যোগাযোগ নম্বর", {
                  required: true,
                  type: "tel",
                  placeholder: "+880 1711-445566",
                })}
              </div>
            </section>

            {/* ---- Details ---- */}
            <section className="card camp-form__section">
              <h2 className="camp-form__legend">4. Details for visitors</h2>

              <div className="camp-form__field">
                <label htmlFor="camp-notes">
                  What services are offered? <span className="camp-form__bn">কী কী সেবা</span>
                </label>
                <textarea
                  id="camp-notes"
                  rows={3}
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Free cataract screening and reading glasses. Bring National ID."
                />
              </div>

              <div className="camp-form__field">
                <label htmlFor="camp-notesBn">
                  Services (Bengali) <span className="camp-form__bn">বাংলায় সেবার বিবরণ</span>
                </label>
                <textarea
                  id="camp-notesBn"
                  rows={3}
                  value={form.notesBn}
                  onChange={set("notesBn")}
                  placeholder="বিনামূল্যে ছানি পরীক্ষা ও চশমা। জাতীয় পরিচয়পত্র সঙ্গে আনুন।"
                />
              </div>

              <div className="camp-form__inline">
                <label className="camp-form__checkbox">
                  <input type="checkbox" checked={form.isFree} onChange={set("isFree")} id="camp-isFree" />
                  This camp is free <span className="camp-form__bn">বিনামূল্যে</span>
                </label>
                {!form.isFree && (
                  <div className="camp-form__field camp-form__field--narrow">
                    <label htmlFor="camp-fee">Fee (৳)</label>
                    <input id="camp-fee" type="number" min="0" value={form.fee} onChange={set("fee")} />
                  </div>
                )}
              </div>
            </section>

            {/* ---- Publish ---- */}
            <section className="card camp-form__section">
              <h2 className="camp-form__legend">5. Publish</h2>
              <div className="camp-form__field camp-form__field--narrow">
                <label htmlFor="camp-passcode">
                  Organizer passcode <span className="camp-form__bn">সংগঠকের পাসকোড</span>
                  <span className="camp-form__req">*</span>
                </label>
                <input
                  id="camp-passcode"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Given by your coordinator"
                />
              </div>

              {formError && <div className="camp-form__banner">{formError}</div>}

              <button type="submit" className="btn-primary" disabled={submitting} id="camp-submit">
                {submitting ? "Publishing..." : "📍 Publish camp to the map"}
              </button>
            </section>
          </form>
        </div>
      </main>
      <SOSButton />
    </>
  );
}
