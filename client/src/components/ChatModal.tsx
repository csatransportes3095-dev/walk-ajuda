import React, { useState, useEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

interface ChatModalProps {
  chatId: number | null;
  phone: string;
  onClose: () => void;
}

export function ChatModal({ chatId, phone, onClose }: ChatModalProps) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], refetch } = trpc.chat.getMessages.useQuery(
    { chatId: chatId || 0, limit: 50 },
    { enabled: !!chatId }
  );

  const sendMut = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setMessage('');
      refetch();
    },
  });

  const markReadMut = trpc.chat.markAsRead.useMutation();

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Polling para novas mensagens
  useEffect(() => {
    if (!chatId) return;
    const interval = setInterval(() => refetch(), 3000);
    return () => clearInterval(interval);
  }, [chatId, refetch]);

  if (!chatId) return null;

  const handleSend = () => {
    if (!message.trim()) return;
    sendMut.mutate({ chatId, senderPhone: phone, message: message.trim() });
  };

  return (
    <div className="fixed bottom-24 right-6 w-96 bg-white rounded-lg shadow-xl z-40 flex flex-col max-h-96">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-blue-600 text-white rounded-t-lg">
        <h3 className="font-semibold">Conversa</h3>
        <button
          onClick={onClose}
          className="text-white hover:bg-blue-700 p-1 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm">
            Nenhuma mensagem ainda. Comece a conversa!
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.senderPhone === phone ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                  msg.senderPhone === phone
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                <p>{msg.message}</p>
                <span className="text-xs opacity-70">
                  {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Digite uma mensagem..."
          className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || sendMut.isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white p-2"
          size="sm"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
