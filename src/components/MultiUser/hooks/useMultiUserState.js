import { useState, useRef } from 'react';
import { EnhancedCrypto } from '../../../crypto/EnhancedCrypto';
import { PersistentStorage } from '../../../utils/PersistentStorage';
import { IdentityStorage } from '../../../crypto/IdentityStorage';

export function useMultiUserState() {

  // ── Connexion ────────────────────────────
  const [roomId, setRoomId]     = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [joined, setJoined]     = useState(false);
  const [savedContactKeys, setSavedContactKeys] = useState({});
  const [pendingSend, setPendingSend]           = useState(false);

  // ── Participants & Messages ───────────────
  const [users, setUsers]               = useState([]);
  const [messages, setMessages]         = useState([]);
  const [attacks, setAttacks]           = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messageText, setMessageText]   = useState('');

  // ── Crypto ───────────────────────────────
  const [cryptoEngine] = useState(() => new EnhancedCrypto());
  const [storage]      = useState(() => new PersistentStorage());
  const [idStorage]    = useState(() => new IdentityStorage());
  const [myPrivateKey, setMyPrivateKey] = useState(null);

  // ── UI State ─────────────────────────────
  const [decryptedMessages, setDecryptedMessages] = useState({});
  const [messageKeys, setMessageKeys]             = useState({});
  const [showDecryptPanel, setShowDecryptPanel]   = useState(false);
  const [currentDecrypting, setCurrentDecrypting] = useState(null);
  const [toasts, setToasts]                       = useState([]);
  const [typingUsers, setTypingUsers]             = useState([]);
  const [unreadCount, setUnreadCount]             = useState(0);
  const [isTyping, setIsTyping]                   = useState(false);
  const [hasMoreMessages, setHasMoreMessages]     = useState(false);
  const [messagesPage, setMessagesPage]           = useState(1);
  const [soundEnabled, setSoundEnabled]           = useState(true);
  const [myFingerprint, setMyFingerprint]         = useState(null);
  const [serverSigningPublicKey, setServerSigningPublicKey] = useState(null);
  const [myCertificate, setMyCertificate]         = useState(null);
  const [otpkCount, setOtpkCount]                 = useState(0);
  const [showMITMPanel, setShowMITMPanel]         = useState(false);
  const [mitmActive, setMitmActive]               = useState(false);
  const [showGroupPanel, setShowGroupPanel]       = useState(false);

  // ── Read Receipts & Safety Number ─────────
  const [readReceipts, setReadReceipts]             = useState({});
  const [safetyNumberTarget, setSafetyNumberTarget] = useState(null);
  const [verifiedContacts, setVerifiedContacts]     = useState(new Set());

  // ── Session status ────────────────────────
  const [sessionStatusMap, setSessionStatusMap] = useState({});

  // ── Refs ─────────────────────────────────
  const myIdentityKeyPairRef   = useRef(null);
  const myIdentityPublicJWKRef = useRef(null);
  const x3dhIdentityRef        = useRef(null);
  const ratchetsRef            = useRef(new Map());
  const cryptoSessionsReady    = useRef(new Set());
  const myPrivateKeyRef        = useRef(null);
  const usersRef               = useRef([]);
  const toastIdRef             = useRef(0);
  const messagesEndRef         = useRef(null);
  const typingTimeoutRef       = useRef(null);
  const messagesContainerRef   = useRef(null);

  return {
    // Connexion
    roomId, setRoomId,
    username, setUsername,
    password, setPassword,
    joined, setJoined,
    savedContactKeys, setSavedContactKeys,
    pendingSend, setPendingSend,

    // Participants & Messages
    users, setUsers,
    messages, setMessages,
    attacks, setAttacks,
    selectedUser, setSelectedUser,
    messageText, setMessageText,

    // Crypto instances
    cryptoEngine, storage, idStorage,
    myPrivateKey, setMyPrivateKey,

    // UI
    decryptedMessages, setDecryptedMessages,
    messageKeys, setMessageKeys,
    showDecryptPanel, setShowDecryptPanel,
    currentDecrypting, setCurrentDecrypting,
    toasts, setToasts,
    typingUsers, setTypingUsers,
    unreadCount, setUnreadCount,
    isTyping, setIsTyping,
    hasMoreMessages, setHasMoreMessages,
    messagesPage, setMessagesPage,
    soundEnabled, setSoundEnabled,
    myFingerprint, setMyFingerprint,
    serverSigningPublicKey, setServerSigningPublicKey,
    myCertificate, setMyCertificate,
    otpkCount, setOtpkCount,
    showMITMPanel, setShowMITMPanel,
    mitmActive, setMitmActive,
    showGroupPanel, setShowGroupPanel,

    // Read Receipts & Safety Number
    readReceipts, setReadReceipts,
    safetyNumberTarget, setSafetyNumberTarget,
    verifiedContacts, setVerifiedContacts,

    // Session
    sessionStatusMap, setSessionStatusMap,

    // Refs
    myIdentityKeyPairRef,
    myIdentityPublicJWKRef,
    x3dhIdentityRef,
    ratchetsRef,
    cryptoSessionsReady,
    myPrivateKeyRef,
    usersRef,
    toastIdRef,
    messagesEndRef,
    typingTimeoutRef,
    messagesContainerRef,
  };
}
