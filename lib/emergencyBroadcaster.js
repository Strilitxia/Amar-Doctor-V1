// Realtime SOS Emergency Broadcaster & State Management for Amar Doctor V1
// Uses BroadcastChannel + LocalStorage Event Fallback for instantaneous multi-view synchronization

const CHANNEL_NAME = "amar_doctor_sos_channel";
const STORAGE_KEY = "amar_doctor_emergencies_v1";

const INITIAL_EMERGENCIES = [
  {
    id: "EMG-9021",
    patientName: "Karim Uddin",
    patientPhone: "+880 1711-234567",
    locationName: "Sreepur, Gazipur Rural Zone",
    lat: 24.2045,
    lng: 90.4682,
    severity: "CRITICAL",
    category: "Snake Bite (সাপের কামড়)",
    status: "DISPATCHED",
    ambulanceUnit: "Ambulance BD-702 (Sadar)",
    etaMinutes: 8,
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    notes: "Patient immobilized, venomous bite on lower leg. Health Complex notified for antivenom."
  },
  {
    id: "EMG-9022",
    patientName: "Amena Begum",
    patientPhone: "+880 1822-987654",
    locationName: "Bhairab Ghat, Kishoreganj",
    lat: 24.0500,
    lng: 90.9833,
    severity: "HIGH",
    category: "Severe Dengue with Bleeding",
    status: "EN_ROUTE",
    ambulanceUnit: "Speedboat Medical Unit #3",
    etaMinutes: 14,
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    notes: "Platelet critically low, IV fluid support required on transit."
  },
  {
    id: "EMG-9023",
    patientName: "Rahim Mia (Child 3y)",
    patientPhone: "+880 1933-445566",
    locationName: "Char Fasson, Bhola",
    lat: 22.1867,
    lng: 90.7103,
    severity: "CRITICAL",
    category: "Child Pneumonia (Fast Breathing)",
    status: "RESOLVED",
    ambulanceUnit: "Upazila Health Response #1",
    etaMinutes: 0,
    timestamp: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    notes: "Admitted to Pediatric Ward, Oxygen saturation stabilized at 98%."
  }
];

export function getStoredEmergencies() {
  if (typeof window === "undefined") return INITIAL_EMERGENCIES;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_EMERGENCIES));
    return INITIAL_EMERGENCIES;
  } catch {
    return INITIAL_EMERGENCIES;
  }
}

export function saveEmergencies(list) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Storage error:", err);
  }
}

export function broadcastSOS(emergencyData) {
  if (typeof window === "undefined") return;

  const currentList = getStoredEmergencies();
  const newEmergency = {
    id: `EMG-${Math.floor(1000 + Math.random() * 9000)}`,
    patientName: emergencyData.patientName || "Emergency Caller (জরুরি কলার)",
    patientPhone: emergencyData.patientPhone || "+880 1700-000000",
    locationName: emergencyData.locationName || "Current GPS Location",
    lat: parseFloat(emergencyData.lat) || 23.8103,
    lng: parseFloat(emergencyData.lng) || 90.4125,
    severity: emergencyData.severity || "CRITICAL",
    category: emergencyData.category || "Emergency Medical Assistance (জরুরি সাহায্য)",
    status: "PENDING",
    ambulanceUnit: "Assigning Nearest Unit...",
    etaMinutes: 10,
    timestamp: new Date().toISOString(),
    notes: emergencyData.notes || "SOS triggered from Amar Doctor Web/PWA."
  };

  const updatedList = [newEmergency, ...currentList];
  saveEmergencies(updatedList);

  // Broadcast to other tabs
  if ("BroadcastChannel" in window) {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: "NEW_SOS", emergency: newEmergency });
      channel.close();
    } catch (e) {
      console.warn("BroadcastChannel error:", e);
    }
  }

  // Also trigger custom window event for same-tab subscribers
  window.dispatchEvent(new CustomEvent("amar_doctor_sos_event", { detail: newEmergency }));

  return newEmergency;
}

export function updateEmergencyStatus(id, newStatus, assignedUnit = null) {
  const currentList = getStoredEmergencies();
  const updated = currentList.map((item) => {
    if (item.id === id) {
      return {
        ...item,
        status: newStatus,
        ambulanceUnit: assignedUnit || item.ambulanceUnit,
        etaMinutes: newStatus === "RESOLVED" ? 0 : item.etaMinutes
      };
    }
    return item;
  });
  saveEmergencies(updated);

  if ("BroadcastChannel" in window) {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: "STATUS_UPDATED", id, newStatus });
      channel.close();
    } catch (e) {
      console.warn("BroadcastChannel error:", e);
    }
  }
  window.dispatchEvent(new CustomEvent("amar_doctor_sos_event", { detail: { id, newStatus } }));
  return updated;
}

export function subscribeToEmergencies(callback) {
  if (typeof window === "undefined") return () => {};

  let channel = null;
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      callback(event.data);
    };
  }

  const localHandler = (event) => {
    callback(event.detail);
  };

  window.addEventListener("amar_doctor_sos_event", localHandler);

  return () => {
    if (channel) channel.close();
    window.removeEventListener("amar_doctor_sos_event", localHandler);
  };
}
