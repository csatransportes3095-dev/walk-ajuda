import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft, Send, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface ChatSidebarProps {
  phone: string;
  onChatSelect: (chatId: number) => void;
  selectedChatId: number | null;
}

export function ChatSidebar({ phone, onChatSelect, selectedChatId }: ChatSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'chat'>('list');
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [activeChatName, setActiveChatName] = useState('');
  const [activeChatPhoto, setActiveChatPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // â”€â”€ PresenÃ§a â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const setOnlineMut = trpc.chat.setOnline.useMutation();

  useEffect(() => {
    if (!phone) return;
    setOnlineMut.mutate({ phone, isOnline: 1 });
    const heartbeat = setInterval(() => {
      setOnlineMut.mutate({ phone, isOnline: 1 });
    }, 30000);
    const handleUnload = () => {
      navigator.sendBeacon(`/api/trpc/chat.setOnline`, JSON.stringify({
        json: { phone, isOnline: 0 }
      }));
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', handleUnload);
      setOnlineMut.mutate({ phone, isOnline: 0 });
    };
  }, [phone]);

  // â”€â”€ Dados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: users = [] } = trpc.chatUsers.listAllUsers.useQuery(
    undefined,
    { refetchInterval: 30000 }
  ) as any;

  const { data: chats = [], refetch: refetchChats } = trpc.chat.listChats.useQuery(
    { phone },
    { enabled: !!phone, refetchInterval: 5000 }
  ) as any;

  const chatIds = (chats as any[]).map((c: any) => c.id);
  const { data: lastMessages = {} } = trpc.chat.getLastMessagePerChat.useQuery(
    { chatIds },
    { enabled: chatIds.length > 0, refetchInterval: 5000 }
  ) as any;

  const userPhones = (users as any[]).map((u: any) => u.phone);
  const { data: onlineUsers = [] } = trpc.chat.getOnlineUsers.useQuery(
    { phones: userPhones },
    { enabled: userPhones.length > 0, refetchInterval: 15000 }
  ) as any;

  const onlinePhones = new Set((onlineUsers as any[]).map((u: any) => u.phone));

  const { data: messages = [], refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
    { chatId: activeChatId || 0, limit: 50 },
    { enabled: !!activeChatId, refetchInterval: 3000 }
  ) as any;

  const groupGeralMut = trpc.chat.findOrCreateGroupGeral.useMutation({
    onSuccess: (chat: any) => {
      if (chat) {
        setActiveChatId(chat.id);
        setActiveChatName('Grupo Geral H2 COLOMBIANO');
        setActiveChatPhoto(null);
        setActiveView('chat');
        onChatSelect(chat.id);
        refetchChats();
      }
    },
  });

  const findOrCreateMut = trpc.chat.findOrCreateIndividual.useMutation({
    onSuccess: (chat: any) => {
      if (chat) {
        setActiveChatId(chat.id);
        setActiveView('chat');
        onChatSelect(chat.id);
        refetchChats();
      }
    },
  });

  const sendMut = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setMessage('');
      refetchMessages();
    },
  });

  const deleteMut = trpc.chat.deleteMessage.useMutation({
    onSuccess: () => refetchMessages(),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim() || !activeChatId) return;
    sendMut.mutate({ chatId: activeChatId, senderPhone: phone, message: message.trim() });
  };

  const handleSelectUser = (userPhone: string, userName: string, userPhoto: string | null) => {
    setActiveChatName(userName);
    setActiveChatPhoto(userPhoto);
    findOrCreateMut.mutate({ phone, otherPhone: userPhone });
  };

  const handleOpenChat = (chatId: number, displayName: string, photo?: string | null) => {
    setActiveChatId(chatId);
    setActiveChatName(displayName);
    setActiveChatPhoto(photo || null);
    setActiveView('chat');
    onChatSelect(chatId);
  };

  const otherUsers = (users as any[]).filter((u: any) => u.phone !== phone);

  // â”€â”€ Estilos compartilhados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const panelStyle: React.CSSProperties = {
    background: '#111827',
    border: '1.5px solid rgba(37,211,102,0.25)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(37,211,102,0.1)',
  };

  const headerStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
    borderBottom: '1px solid rgba(37,211,102,0.2)',
  };

  // â”€â”€ Lista de contatos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ContactList = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={headerStyle}>
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-green-400" />
          <h2 className="font-bold text-base text-white tracking-wide">Mensagens</h2>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grupo Geral */}
      <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => groupGeralMut.mutate({ phone, allPhones: (users as any[]).map((u: any) => u.phone) })}
          disabled={groupGeralMut.isPending || !phone}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition active:scale-95 disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)',
            border: '1.5px solid rgba(37,211,102,0.4)',
            boxShadow: '0 2px 12px rgba(37,211,102,0.15)',
          }}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)' }}>
            ðŸ‘¥
          </div>
          <div className="text-left flex-1">
            <p className="font-bold text-white text-sm">Grupo Geral</p>
            <p className="text-xs text-green-400/80">Todos os usuÃ¡rios da planilha</p>
          </div>
          {groupGeralMut.isPending && <span className="text-xs text-white/50">...</span>}
        </button>
      </div>

      {/* Recentes â€” apenas conversas com mensagens */}
      {(() => {
        const chatsWithMessages = (chats as any[]).filter((chat: any) => !!(lastMessages as any)[chat.id]);
        if (chatsWithMessages.length === 0) return null;
        return (
        <div className="flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] font-bold text-green-400/60 px-4 pt-2.5 pb-1 uppercase tracking-widest">
            Recentes ({chatsWithMessages.length})
          </p>
          {chatsWithMessages.slice(0, 5).map((chat: any) => {
            const lastMsg = (lastMessages as any)[chat.id];
            return (
              <button
                key={chat.id}
                onClick={() => handleOpenChat(chat.id, chat.displayName, chat.displayPhoto)}
                className="w-full flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/5 active:bg-white/10"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="relative flex-shrink-0">
                  {chat.displayPhoto ? (
                    <img src={chat.displayPhoto} alt={chat.displayName}
                      className="w-10 h-10 rounded-full object-cover"
                      style={{ border: '2px solid rgba(37,211,102,0.35)' }} />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: 'linear-gradient(135deg, #065f46, #128c7e)', border: '2px solid rgba(37,211,102,0.35)' }}>
                      {chat.displayName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-semibold text-white text-sm truncate">{chat.displayName}</p>
                  <p className="text-xs text-white/40 truncate">{lastMsg.message}</p>
                </div>
              </button>
            );
          })}
        </div>
        );
      })()}

      {/* UsuÃ¡rios */}
      <div className="flex-1 overflow-y-auto">
        <p className="text-[10px] font-bold text-green-400/60 px-4 pt-2.5 pb-1 uppercase tracking-widest sticky top-0"
          style={{ background: '#111827' }}>
          UsuÃ¡rios ({otherUsers.length})
        </p>
        {otherUsers.length === 0 ? (
          <p className="text-center text-white/30 text-sm py-8">Nenhum usuÃ¡rio disponÃ­vel</p>
        ) : (
          otherUsers.map((user: any) => {
            const isOnline = onlinePhones.has(user.phone);
            return (
              <button
                key={user.phone}
                onClick={() => handleSelectUser(user.phone, user.name, user.profilePhoto)}
                disabled={findOrCreateMut.isPending}
                className="w-full flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/5 active:bg-white/10"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="relative flex-shrink-0">
                  {user.profilePhoto ? (
                    <img src={user.profilePhoto} alt={user.name}
                      className="w-10 h-10 rounded-full object-cover"
                      style={{ border: `2px solid ${isOnline ? 'rgba(37,211,102,0.5)' : 'rgba(255,255,255,0.1)'}` }} />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: 'linear-gradient(135deg, #1e3a5f, #1e40af)', border: `2px solid ${isOnline ? 'rgba(37,211,102,0.5)' : 'rgba(255,255,255,0.1)'}` }}>
                      {user.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
                    style={{ background: isOnline ? '#25d366' : '#4b5563', border: '2px solid #111827' }} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-semibold text-white text-sm truncate">{user.name}</p>
                  <p className="text-xs font-medium" style={{ color: isOnline ? '#25d366' : '#6b7280' }}>
                    {isOnline ? 'â— online' : 'â—‹ offline'}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  // â”€â”€ Conversa aberta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ChatView = () => (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-3 flex-shrink-0" style={headerStyle}>
        <button
          onClick={() => setActiveView('list')}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {activeChatPhoto ? (
          <img src={activeChatPhoto} alt={activeChatName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            style={{ border: '2px solid rgba(37,211,102,0.4)' }} />
        ) : (
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #065f46, #128c7e)', border: '2px solid rgba(37,211,102,0.4)' }}>
            {activeChatName?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">{activeChatName}</p>
          <p className="text-xs text-green-400/70">
            {findOrCreateMut.isPending ? 'Conectando...' : 'conversa'}
          </p>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ background: '#0f172a' }}>
        {findOrCreateMut.isPending ? (
          <div className="text-center text-white/40 text-sm py-8">Conectando...</div>
        ) : (messages as any[]).length === 0 ? (
          <div className="text-center text-white/30 text-sm py-8">
            Nenhuma mensagem ainda.<br />Comece a conversa!
          </div>
        ) : (
          (messages as any[]).map((msg: any) => {
            const isOwn = msg.senderPhone === phone;
            return (
              <div key={msg.id} className={`flex items-end gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow"
                  style={isOwn
                    ? { background: 'linear-gradient(135deg, #065f46, #047857)', borderBottomRightRadius: '4px', color: '#fff' }
                    : { background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderBottomLeftRadius: '4px', color: '#e2e8f0' }
                  }
                >
                  <p className="break-words leading-relaxed">{msg.message}</p>
                  <div className="flex items-center justify-end gap-1.5 mt-1">
                    <span className="text-[10px]" style={{ color: isOwn ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)' }}>
                      {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isOwn && (
                      <button
                        onClick={() => deleteMut.mutate({ messageId: msg.id, requesterPhone: phone })}
                        disabled={deleteMut.isPending}
                        className="flex items-center justify-center transition-all active:scale-90 rounded-full"
                        style={{ width: '16px', height: '16px', background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)' }}
                        title="Deletar"
                      >
                        <Trash2 style={{ width: '9px', height: '9px', color: '#f87171' }} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ background: '#1e293b', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Digite uma mensagem"
          disabled={findOrCreateMut.isPending}
          className="flex-1 px-4 py-2 rounded-full text-white text-sm focus:outline-none disabled:opacity-50 placeholder:text-white/30"
          style={{ background: '#0f172a', border: '1.5px solid rgba(37,211,102,0.2)' }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(37,211,102,0.6)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(37,211,102,0.2)')}
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || sendMut.isPending || findOrCreateMut.isPending}
          className="w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #25d366, #075e54)', boxShadow: '0 2px 10px rgba(37,211,102,0.3)' }}
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* â”€â”€ BotÃ£o flutuante â”€â”€ */}
      <button
        id="chat-floating-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90"
        style={{
          background: 'linear-gradient(135deg, #25d366 0%, #075e54 100%)',
          boxShadow: '0 0 0 3px rgba(37,211,102,0.35), 0 8px 24px rgba(7,94,84,0.6)',
          border: '2px solid rgba(37,211,102,0.7)',
        }}
        title="Mensagens"
      >
        <MessageCircle className="w-7 h-7 text-white drop-shadow" />
      </button>

      {/* â”€â”€ Painel: desktop (canto direito, 380px) / mobile (quase tela cheia) â”€â”€ */}
      {isOpen && (
        <div
          className="fixed z-50 flex flex-col rounded-2xl overflow-hidden"
          style={{
            ...panelStyle,
            // Desktop: painel lateral fixo
            right: '1rem',
            bottom: '5.5rem',
            // Mobile: quase tela cheia via media query simulada com CSS vars
            width: 'min(380px, calc(100vw - 1rem))',
            height: 'min(600px, calc(100dvh - 7rem))',
          }}
        >
          {activeView === 'list' ? <ContactList /> : <ChatView />}
        </div>
      )}
    </>
  );
}
