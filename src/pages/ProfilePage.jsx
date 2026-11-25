import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import Layout from '../components/Layout';
import { Icon } from '../components/Icons';
import { Avatar, Card, Pill } from '../components/ui';
import { useToast } from '../components/Toast';
import { useUser } from '../components/UserProvider';
import OrderDetailsDrawer, { TXN_STATUS, rupees } from '../components/OrderDetailsDrawer';
import { getSearchParam, replaceSearchParam, setSearchParam } from '../lib/browser';
import { getCourseBundleProgress, getTestSeriesProgress, getTransaction, getTransactions, removeIdPhoto, updateProfile as saveProfileApi, uploadIdPhoto, uploadProfilePhoto } from '../lib/candidateApi';
import { PLACES, buildProfilePayload, isOfflineStudent } from '../lib/profile';

const STUDENT_PHOTO_WIDTH = 826;
const STUDENT_PHOTO_HEIGHT = 1062;

const TABS = [
  { id: 1, label: (name) => `About ${name || ''}`, icon: Icon.User },
  { id: 2, label: () => 'Courses Enrolled', icon: Icon.List },
  { id: 5, label: () => 'My Transactions', icon: Icon.FileText }, // id 5: ?currentTab=3 and 4 were already taken
  // Edit Details (?currentTab=3) is not in the side panel: it opens from "Update Profile" on the About card.
  { id: 3, label: () => 'Edit Details', icon: Icon.Pencil, hidden: true },
  { id: 4, label: () => 'ID Card Photo', icon: Icon.Image, offlineOnly: true }, // classroom students only
];

// My Transactions: whether pending and failed orders are hidden. Hidden unless
// the candidate chose to see them ('0' in localStorage).
const HIDE_UNSUCCESSFUL_KEY = 'cpHideUnsuccessfulTransactions';
function readHideUnsuccessful() {
  try { return window.localStorage.getItem(HIDE_UNSUCCESSFUL_KEY) !== '0'; } catch { return true; }
}

function parentsNames(p = {}) {
  const mother = p.motherName || '';
  const father = p.fatherName || '';
  if (mother && father) return `${mother} & ${father}`;
  return mother || father || '';
}

function boardAndYear(p = {}) {
  const board = p.board || '';
  let year = parseInt(p.yearOfPassing, 10) || '';
  if (year < 1) year = '';
  if (board && year) return `${board} / ${year}`;
  return board || year || '';
}

// Convert HEIC/HEIF (iPhone photos) before reading; everything else as-is.
async function fileToDataUrl(file) {
  let blob = file;
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    const { default: heic2any } = await import('heic2any');
    blob = await heic2any({ blob: file, toType: 'image/jpeg' });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Modal with a file picker and Cropper.js. `crop` holds the cropper options
 * and `output` the getCroppedCanvas() options; onSave gets the data URL.
 */
function PhotoCropModal({ open, title, note, crop, output, mime, quality, onSave, onClose }) {
  const [src, setSrc] = useState('');
  const imgRef = useRef(null);
  const cropperRef = useRef(null);

  useEffect(() => {
    if (!open) { setSrc(''); cropperRef.current?.destroy(); cropperRef.current = null; }
  }, [open]);

  if (!open) return null;

  async function handleFile(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    cropperRef.current?.destroy();
    cropperRef.current = null;
    setSrc(await fileToDataUrl(file));
  }

  function initCropper() {
    if (!imgRef.current) return;
    cropperRef.current?.destroy();
    cropperRef.current = new Cropper(imgRef.current, crop);
  }

  function handleSave() {
    if (!cropperRef.current) return;
    const canvas = cropperRef.current.getCroppedCanvas(output);
    const dataUrl = mime ? canvas.toDataURL(mime, quality) : canvas.toDataURL();
    cropperRef.current.destroy();
    cropperRef.current = null;
    onSave(dataUrl);
  }

  return (
    <div className="cp-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cp-modal cp-modal-lg" role="dialog" aria-modal="true" aria-labelledby="cp-photo-title">
        <h2 id="cp-photo-title">{title}</h2>
        <div className="cp-crop-frame">
          {src && <img ref={imgRef} src={src} alt="" onLoad={initCropper} />}
        </div>
        <p style={{ marginTop: 14 }}>{note}</p>
        <div className="cp-modal-actions is-spread">
          <label className="cp-btn cp-btn-ghost cp-file-btn">
            <Icon.Image width={16} height={16} /> Select an Image
            <input type="file" accept="image/jpeg, image/png" onChange={handleFile} aria-label="Select an image" />
          </label>
          <span className="cp-grow" />
          <button type="button" className="cp-btn cp-btn-light" onClick={onClose}>Close</button>
          {src && <button type="button" className="cp-btn cp-btn-primary" onClick={handleSave}>Save</button>}
        </div>
      </div>
    </div>
  );
}

// dd-mm-yyyy text input with a native date picker beside it.
function DobInput({ value, onChange }) {
  const nativeRef = useRef(null);
  function fromNative(e) {
    const iso = e.target.value; // yyyy-mm-dd
    if (!iso) return;
    const [y, m, d] = iso.split('-');
    onChange(`${d}-${m}-${y}`);
  }
  return (
    <div className="cp-dob">
      <input type="text" className="cp-input" placeholder="dd-mm-yyyy" autoComplete="off" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="cp-icon-btn" aria-label="Pick a date" onClick={() => (nativeRef.current?.showPicker ? nativeRef.current.showPicker() : nativeRef.current?.click())}>
        <Icon.Calendar width={18} height={18} />
      </button>
      <input ref={nativeRef} type="date" className="cp-dob-native" tabIndex={-1} aria-hidden="true" onChange={fromNative} />
    </div>
  );
}

export default function ProfilePage() {
  const toast = useToast();
  const { profile, updateProfile } = useUser() || {};
  const p = profile || {};
  const [activeTab, setActiveTab] = useState(() => parseInt(getSearchParam('currentTab'), 10) || 1);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [idPhotoOpen, setIdPhotoOpen] = useState(false);

  // The ID-card photo is for offline (classroom) students: `offlineOnboarded`.
  const offline = isOfflineStudent(profile);
  const tabs = TABS.filter((t) => !t.hidden && (!t.offlineOnly || offline));
  useEffect(() => {
    if (profile && !offline && activeTab === 4) { setActiveTab(1); replaceSearchParam('currentTab', 1); }
  }, [profile, offline, activeTab]);

  // Each enrolled course links to its own page: /test-series?id=<series code>
  // or /courses?id=<course id>. The profile's enrolment rows carry no code, so
  // it is looked up by title in the candidate's series / course lists (a `code`
  // on the row wins if the API sends one). Unmatched rows open the list page.
  const [courseIds, setCourseIds] = useState({});
  const hasSeries = (p.courses || []).some((c) => c?.type === 'Test Series');
  const hasCourse = (p.courses || []).some((c) => c?.type && c.type !== 'Test Series');
  useEffect(() => {
    if (activeTab !== 2) return undefined;
    let live = true;
    const key = (type, title) => `${type}|${(title || '').trim().toLowerCase()}`;
    const add = (type, list, idOf) => {
      if (!live) return;
      setCourseIds((prev) => {
        const next = { ...prev };
        (list || []).forEach((item) => { if (item?.title && idOf(item)) next[key(type, item.title)] = idOf(item); });
        return next;
      });
    };
    if (hasSeries) getTestSeriesProgress().then((d) => add('series', d?.testSeriesEnrolled, (t) => t.code)).catch(() => {});
    if (hasCourse) getCourseBundleProgress().then((d) => add('course', d?.enrolledCourses, (b) => b.id)).catch(() => {});
    return () => { live = false; };
  }, [activeTab, hasSeries, hasCourse]);

  function coursePath(course) {
    const series = course.type === 'Test Series';
    const base = series ? '/test-series' : '/courses';
    const id = course.code || courseIds[`${series ? 'series' : 'course'}|${(course.title || '').trim().toLowerCase()}`];
    return id ? `${base}?id=${encodeURIComponent(id)}` : base;
  }

  // Transactions tab: every purchase, loaded a page at a time when the tab is opened.
  const [txns, setTxns] = useState({ list: null, page: 0, hasMore: false, loading: false, error: false });
  const [orderOpen, setOrderOpen] = useState(null); // the transaction shown in the order drawer
  // The open order is kept in the URL: /profile?currentTab=5&orderId=<order id>
  function openOrder(order) {
    setOrderOpen(order);
    replaceSearchParam('orderId', order ? order.id : null);
  }
  // A link to an order: fetched by its id, since it may not be in the listed page
  // or may be hidden by "Show Successful Only".
  useEffect(() => {
    const orderId = getSearchParam('orderId');
    if (activeTab !== 5 || !orderId) return undefined;
    let live = true;
    getTransaction(orderId)
      .then((order) => {
        if (!live) return;
        if (order) setOrderOpen(order);
        else { toast(`Order #${orderId} was not found`); replaceSearchParam('orderId', null); }
      })
      .catch(() => { if (live) toast('Could not open the order'); });
    return () => { live = false; };
  }, [activeTab]);
  // "Show Successful Only": on unless the candidate turned it off (remembered in localStorage).
  const [hideUnsuccessful, setHideUnsuccessful] = useState(readHideUnsuccessful);
  const txnRequest = useRef(0); // a reply to an older request (the toggle was flipped since) is dropped
  // ?orderId= (the link checkout sends a buyer to after paying) opens that order's drawer, once, when the list arrives.
  const orderFromLink = useRef(getSearchParam('orderId'));
  useEffect(() => {
    if (!orderFromLink.current || !txns.list) return;
    const wanted = txns.list.find((t) => String(t.id) === orderFromLink.current || String(t.orderReference) === orderFromLink.current);
    orderFromLink.current = null;
    if (wanted) setOrderOpen(wanted);
  }, [txns.list]);
  function loadTransactions(page, successfulOnly = hideUnsuccessful) {
    const seq = ++txnRequest.current;
    setTxns((t) => ({ ...t, loading: true, error: false }));
    getTransactions(page, { successfulOnly })
      .then((d) => {
        if (seq !== txnRequest.current) return;
        setTxns((t) => ({
          list: page === 0 ? (d?.transactions || []) : [...(t.list || []), ...(d?.transactions || [])],
          page, hasMore: !!d?.hasMore, loading: false, error: false,
        }));
      })
      .catch(() => { if (seq === txnRequest.current) setTxns((t) => ({ ...t, loading: false, error: true })); });
  }
  useEffect(() => {
    if (activeTab === 5) loadTransactions(0);
  }, [activeTab]);

  function toggleHideUnsuccessful(hide) {
    setHideUnsuccessful(hide);
    try { window.localStorage.setItem(HIDE_UNSUCCESSFUL_KEY, hide ? '1' : '0'); } catch { /* storage blocked: applies to this visit only */ }
    setTxns({ list: null, page: 0, hasMore: false, loading: true, error: false });
    loadTransactions(0, hide);
  }

  // Edit Details belongs to the About tab, so About stays highlighted while editing.
  const isTabActive = (id) => activeTab === id || (id === 1 && activeTab === 3);

  function changeActiveTab(id) {
    replaceSearchParam('orderId', null); // an order link belongs to My Transactions only
    setSearchParam('currentTab', id);
    setActiveTab(id);
  }

  const set = (key) => (value) => updateProfile?.((current) => ({ ...(current || {}), [key]: value }));
  const field = (key) => ({ value: p[key] ?? '', onChange: (e) => set(key)(e.target.value) });

  async function saveProfile() {
    const payload = buildProfilePayload(p);
    try {
      const res = await saveProfileApi(payload);
      toast(res.status === 'success' ? 'Profile has been updated' : 'Update failed');
    } catch {
      toast('Update failed');
    }
  }

  async function saveCandidatePhoto(dataUrl) {
    setPhotoOpen(false);
    try {
      const res = await uploadProfilePhoto(dataUrl);
      if (res.status === 'success') {
        set('photo')(res.data);
        toast('Profile photo has been updated');
      }
    } catch { /* silent, as before */ }
  }

  async function saveStudentPhoto(dataUrl) {
    try {
      const res = await uploadIdPhoto(dataUrl);
      if (res.status === 'success') {
        set('idPhoto')(`${res.data}?t=${Date.now()}`);
        toast('Student photo has been updated');
      } else {
        toast('Upload failed');
      }
    } catch {
      toast('Upload failed');
    }
    setIdPhotoOpen(false);
  }

  async function removeStudentPhoto() {
    if (!window.confirm('Remove the student photo?')) return;
    try {
      const res = await removeIdPhoto();
      if (res.status === 'success') {
        set('idPhoto')('');
        toast('Student photo has been removed');
      } else {
        toast('Remove failed');
      }
    } catch {
      toast('Remove failed');
    }
  }

  const select = (key, options) => (
    <span className="cp-select-wrap">
      <select className="cp-select" {...field(key)}>{options}</select>
      <Icon.ChevronDown width={16} height={16} />
    </span>
  );

  return (
    <Layout title="Profile" hideTitle>
      <PhotoCropModal
        open={photoOpen}
        title="Profile photo"
        note="Upload good quality image. Only JPG, PNG files are supported."
        crop={{ aspectRatio: 1, autoCropArea: 0.9, scalable: false }}
        output={{ width: 100, height: 100, fillColor: '#fff', imageSmoothingEnabled: false, imageSmoothingQuality: 'high' }}
        onSave={saveCandidatePhoto}
        onClose={() => setPhotoOpen(false)}
      />
      <PhotoCropModal
        open={idPhotoOpen}
        title="Student photo"
        note={<>Crop window is fixed to {STUDENT_PHOTO_WIDTH} &times; {STUDENT_PHOTO_HEIGHT} pixels. Only JPG, PNG files are supported.</>}
        crop={{ aspectRatio: STUDENT_PHOTO_WIDTH / STUDENT_PHOTO_HEIGHT, autoCropArea: 1, viewMode: 1, scalable: false }}
        output={{ width: STUDENT_PHOTO_WIDTH, height: STUDENT_PHOTO_HEIGHT, fillColor: '#fff', imageSmoothingEnabled: true, imageSmoothingQuality: 'high' }}
        mime="image/jpeg"
        quality={0.92}
        onSave={saveStudentPhoto}
        onClose={() => setIdPhotoOpen(false)}
      />

      <div className="cp-page">
        <div className="cp-grid cp-grid-profile">
          <div className="cp-profile-side">
            <Card className="cp-profile-card">
              <div className="photo-container" role="button" tabIndex={0} aria-label="Change photo" onClick={() => setPhotoOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter') setPhotoOpen(true); }}>
                <Avatar src={p.photo} size="xl" className="photo" pending={!profile} />
                <span className="overlay-text">Change Photo</span>
              </div>
              <div className="name">{p.name}</div>
              <div className="info">{p.aspiration && <Pill tone="sky">{p.aspiration}</Pill>}</div>
              <p className="joined">Joined on {p.joined}</p>

              <div className="cp-profile-nav" role="tablist">
                {tabs.map(({ id, label, icon: Ico }) => (
                  <button key={id} type="button" role="tab" aria-selected={isTabActive(id)} className={`list-group-item ${isTabActive(id) ? 'active' : ''}`} onClick={() => changeActiveTab(id)}>
                    <Ico width={18} height={18} /> {label(p.name)}
                    {id === 2 && <span className="badge">{p.courses?.length || 0}</span>}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div>
            {activeTab === 1 && (
              <Card>
                <div className="cp-card-head">
                  <h2>About {p.name}</h2>
                  <button type="button" className="cp-btn cp-btn-ghost" onClick={() => changeActiveTab(3)}>
                    <Icon.Pencil width={15} height={15} /> Update Profile
                  </button>
                </div>
                {p.about ? (
                  <figure className="cp-about-quote">
                    <span className="cp-about-quote-mark" aria-hidden="true">&ldquo;</span>
                    <blockquote><p>{p.about}</p></blockquote>
                    <figcaption>
                      <span className="cp-about-quote-rule" aria-hidden="true" />
                      <strong>{p.name}</strong>
                      {p.aspiration && <small>{p.aspiration}</small>}
                    </figcaption>
                  </figure>
                ) : <p className="cp-about-text" />}

                <div className="cp-about-section">
                  <h4>{p.gender === 'Female' ? <Icon.User width={16} height={16} /> : <Icon.User width={16} height={16} />}Personal Information</h4>
                  <dl className="cp-dl">
                    <div><dt>Full Name</dt><dd>{p.name}</dd></div>
                    <div><dt>Birthday</dt><dd>{p.dob}</dd></div>
                    <div><dt>Gender</dt><dd>{p.gender}</dd></div>
                    <div><dt>Place</dt><dd>{p.place}</dd></div>
                    <div><dt>Parents</dt><dd>{parentsNames(p)}</dd></div>
                  </dl>
                </div>

                <div className="cp-about-section">
                  <h4><Icon.Graduation width={16} height={16} />Educational Information</h4>
                  <dl className="cp-dl">
                    <div><dt>Aspiration</dt><dd>{p.aspiration}</dd></div>
                    <div><dt>Class of Study</dt><dd>{p.classOfStudy} {p.lastInstitution ? p.lastInstitution : ''}</dd></div>
                    <div><dt>Board &amp; Year of Passing Class 12</dt><dd>{boardAndYear(p)}</dd></div>
                  </dl>
                </div>

                <div className="cp-about-section">
                  <h4><Icon.Mail width={16} height={16} />Communication Details</h4>
                  <dl className="cp-dl">
                    <div><dt>Registered Number</dt><dd>{p.registeredMobile} <Icon.CheckCircle width={14} height={14} className="cp-verified" /></dd></div>
                    <div><dt>Phone</dt><dd>{p.communicationMobile}</dd></div>
                    <div><dt>Email</dt><dd>{p.email}</dd></div>
                  </dl>
                </div>
              </Card>
            )}

            {activeTab === 2 && (
              <Card>
                <div className="cp-card-head">
                  <h2>Courses Enrolled by {p.name}</h2>
                  <Pill tone="ghost">{p.courses?.length || 0} enrolled</Pill>
                </div>
                <div className="cp-table-wrap">
                  <table className="cp-table" style={{ minWidth: 520 }}>
                    <thead>
                      <tr><th>#</th><th>Course</th><th>Type</th><th>Access</th><th>Valid Till</th></tr>
                    </thead>
                    <tbody>
                      {(p.courses || []).map((course, i) => (
                        <tr key={i}>
                          <td className="cp-td-muted">{i + 1}</td>
                          <td>
                            <Link className="cp-course-link" to={coursePath(course)}><strong>{course.title}</strong></Link>
                            {course.metadata?.commencement && (
                              <small className="cp-course-schedule">{course.metadata.commencement} to {course.metadata.conclusion}</small>
                            )}
                          </td>
                          <td><Pill tone="ghost" size="sm">{course.type}</Pill></td>
                          <td>
                            <Pill tone={course.accessLevel === 'Premium' ? 'sky' : 'ghost'} size="sm" title={course.accessLevel === 'Premium' ? 'Paid Content' : ''}>
                              {course.accessLevel === 'Premium' && <Icon.Crown width={12} height={12} />} {course.accessLevel}
                            </Pill>
                          </td>
                          <td className="cp-td-muted">{course.expiry !== 'Unknown' ? `until ${course.expiry}` : 'Unlimited'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(!p.courses || p.courses.length === 0) && <p className="cp-empty cp-foot-note">You are not enrolled in any course yet.</p>}
              </Card>
            )}

            {activeTab === 5 && (
              <Card>
                <OrderDetailsDrawer order={orderOpen} onClose={() => openOrder(null)} />
                <div className="cp-card-head">
                  <h2>My Transactions</h2>
                  <label className="cp-switch">
                    <input type="checkbox" role="switch" checked={hideUnsuccessful} onChange={(e) => toggleHideUnsuccessful(e.target.checked)} />
                    <i aria-hidden="true" />
                    <span>Show Successful Only</span>
                  </label>
                </div>
                {txns.list && txns.list.length > 0 && (
                  <div className="cp-table-wrap">
                    <table className="cp-table" style={{ minWidth: 640 }}>
                      <thead>
                        <tr><th>Order</th><th>Items</th><th>Date</th><th>Payment</th><th className="cp-txn-amount">Amount</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {txns.list.map((t) => {
                          const st = TXN_STATUS[t.status] || TXN_STATUS.failed;
                          return (
                            // The whole row opens the order drawer; the first item stands for the order, "(+2)" for the rest.
                            <tr
                              key={t.id}
                              className="cp-txn-row"
                              tabIndex={0}
                              role="button"
                              aria-label={`Order ${t.orderReference}: view details`}
                              onClick={() => openOrder(t)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOrder(t); } }}
                            >
                              <td className="cp-td-muted">#{t.orderReference}</td>
                              <td>
                                {t.items?.length > 0
                                  ? <strong className="cp-txn-item">{t.items[0].title || t.items[0].code}{t.items.length > 1 && <span className="cp-txn-more-items"> (+{t.items.length - 1})</span>}</strong>
                                  : <span className="cp-td-muted">-</span>}
                              </td>
                              <td className="cp-td-muted">{t.date || '-'}{t.time && <small className="cp-course-schedule">{t.time}</small>}</td>
                              {/* Bought on an installment plan: the amount is the first payment, the rest is in the order's schedule. */}
                              {/* Plain text, not a chip. An order that was never paid is not "Completely Paid". */}
                              <td className="cp-txn-payment">
                                {t.paymentMode === 'INSTALLMENTS'
                                  ? <span title="Open the order to see the payment schedule">Opted for Instalments</span>
                                  : (t.status === 'successful' ? 'Completely Paid' : <span className="cp-td-muted">-</span>)}
                              </td>
                              <td className="cp-txn-amount"><strong>{rupees(t.amount)}</strong></td>
                              <td><Pill tone={st.tone} size="sm" title={st.hint}>{st.label}</Pill></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {txns.list && txns.list.length === 0 && <p className="cp-empty cp-foot-note">{hideUnsuccessful ? 'You have no successful transactions yet. Turn off the filter above to see pending and failed ones.' : 'You have not made any purchase yet.'}</p>}
                {!txns.list && txns.loading && <p className="cp-empty cp-foot-note">Loading your transactions…</p>}
                {txns.error && (
                  <p className="cp-empty cp-foot-note">
                    Could not load your transactions. <button type="button" className="cp-btn cp-btn-ghost" onClick={() => loadTransactions(txns.list ? txns.page + 1 : 0)}>Try again</button>
                  </p>
                )}
                {txns.list && txns.hasMore && !txns.error && (
                  <div className="cp-txn-more">
                    <button type="button" className="cp-btn cp-btn-ghost" disabled={txns.loading} onClick={() => loadTransactions(txns.page + 1)}>
                      {txns.loading ? 'Loading…' : 'Show more'}
                    </button>
                  </div>
                )}
              </Card>
            )}

            {activeTab === 3 && (
              <Card>
                <div className="cp-card-head">
                  <div>
                    <h2>Edit Details</h2>
                    <p>Keep your details up to date so we can reach you about exams and results.</p>
                  </div>
                  <button type="button" className="cp-btn cp-btn-ghost" onClick={() => changeActiveTab(1)}>
                    <Icon.ChevronLeft width={15} height={15} /> Back
                  </button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); saveProfile(); }}>
                  <div className="cp-form-grid">
                    <label className="cp-field"><span>Name</span><input type="text" className="cp-input" placeholder="Full Name" {...field('name')} /></label>
                    <label className="cp-field"><span>Registered Mobile</span><input type="text" className="cp-input" value={p.registeredMobile || ''} disabled readOnly /></label>
                    <label className="cp-field">
                      <span>Place</span>
                      {select('place', (
                        <>
                          <option value="">Not Known</option>
                          {Object.entries(PLACES).map(([group, items]) => (
                            <optgroup key={group} label={group}>
                              {items.map((item) => (Array.isArray(item)
                                ? <option key={item[0]} value={item[0]}>{item[1]}</option>
                                : <option key={item} value={item}>{item}</option>))}
                            </optgroup>
                          ))}
                        </>
                      ))}
                    </label>
                    <label className="cp-field"><span>Date of Birth</span><DobInput value={p.dob} onChange={set('dob')} /></label>
                    <label className="cp-field">
                      <span>Gender</span>
                      {select('gender', <><option value="">Not Selected</option><option value="Male">Male</option><option value="Female">Female</option><option value="Trans Gender">Trans Gender</option></>)}
                    </label>
                    <label className="cp-field"><span>Father's Name</span><input type="text" className="cp-input" placeholder="Father's Name" {...field('fatherName')} /></label>
                    <label className="cp-field"><span>Mother's Name</span><input type="text" className="cp-input" placeholder="Mother's Name" {...field('motherName')} /></label>
                    <label className="cp-field">
                      <span>Class of Study</span>
                      {select('classOfStudy', <><option value="">None</option><option value="Class 11 Going">Class 11 Going</option><option value="Class 12 Going">Class 12 Going</option><option value="Repeater">Repeater</option></>)}
                    </label>
                    <label className="cp-field">
                      <span>Your Aspiration</span>
                      {select('aspiration', <><option value="">None</option><option value="Aspiring Engineer">Aspiring Engineer</option><option value="Aspiring Doctor">Aspiring Doctor</option><option value="Aspiring Scientist">Aspiring Scientist</option></>)}
                    </label>
                    <label className="cp-field"><span>Year of Passing Class 12</span><input type="text" className="cp-input" placeholder="Year of Passing Class 12" {...field('yearOfPassing')} /></label>
                    <label className="cp-field">
                      <span>Class 12 Board</span>
                      {select('board', <><option value="Kerala State Board">Kerala State Board</option><option value="CBSE">CBSE</option><option value="ICSE">ICSE</option><option value="OTHER">Others</option></>)}
                    </label>
                    <label className="cp-field is-full"><span>Last Studied Institution</span><input type="text" className="cp-input" placeholder="Name of the School or Coaching Institution" {...field('lastInstitution')} /></label>
                    <label className="cp-field"><span>Phone for Communication</span><input type="text" className="cp-input" placeholder="WhatsApp number preferred" {...field('communicationMobile')} /></label>
                    <label className="cp-field"><span>Email for Communication</span><input type="text" className="cp-input" placeholder="Email Address" {...field('email')} /></label>
                    <label className="cp-field is-full"><span>Few words about you!</span><textarea className="cp-textarea" {...field('about')} /></label>
                  </div>
                  <div className="cp-form-actions">
                    <button type="submit" className="cp-btn cp-btn-primary"><Icon.Save width={16} height={16} /> Save Profile</button>
                  </div>
                </form>
              </Card>
            )}

            {activeTab === 4 && offline && (
              <Card>
                <div className="cp-card-head">
                  <div>
                    <h2>Student Photo</h2>
                    <p>Upload a clear passport-style photo. It will be cropped to a <strong>826 &times; 1062 pixels</strong> window before saving.</p>
                  </div>
                </div>
                {p.idPhoto ? (
                  <div className="cp-photo-preview">
                    <img src={p.idPhoto} alt="Student" />
                    <div className="cp-photo-actions">
                      <button type="button" className="cp-btn cp-btn-primary" onClick={() => setIdPhotoOpen(true)}><Icon.Pencil width={16} height={16} /> Modify Photo</button>
                      <button type="button" className="cp-btn cp-btn-danger" onClick={removeStudentPhoto}><Icon.Trash width={16} height={16} /> Remove Photo</button>
                    </div>
                  </div>
                ) : (
                  <div className="cp-state">
                    <span className="cp-state-icon"><Icon.Image /></span>
                    <p>No student photo uploaded yet.</p>
                    <button type="button" className="cp-btn cp-btn-primary" onClick={() => setIdPhotoOpen(true)}><Icon.Upload width={16} height={16} /> Upload Student Photo</button>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
