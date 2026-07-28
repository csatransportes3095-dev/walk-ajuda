import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

interface UsersListProps {
  currentPhone: string;
  onSelectUser: (phone: string) => void;
}

export function UsersList({ currentPhone, onSelectUser }: UsersListProps) {
  const { data: users = [] } = trpc.chatUsers.listAllUsers.useQuery();
  const [isExpanded, setIsExpanded] = useState(false);

  // Filtrar usuários (remover o atual)
  const otherUsers = users.filter((u: any) => u.phone !== currentPhone);

  if (otherUsers.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-24 left-6 w-80 bg-white rounded-lg shadow-xl z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
        <h3 className="font-semibold">👥 Usuários Online</h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-white hover:bg-blue-800 p-1 rounded transition"
        >
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>

      {/* Lista de usuários */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto">
          {otherUsers.map((user: any) => (
            <div
              key={user.phone}
              className="flex items-center justify-between p-3 border-b hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3 flex-1">
                {/* Avatar com foto real ou inicial */}
                {user.profilePhoto ? (
                  <img
                    src={user.profilePhoto}
                    alt={user.name}
                    className="w-10 h-10 rounded-full object-cover border-2 border-blue-500"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                    {user.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}

                {/* Nome e telefone */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate text-sm">
                    {user.name || 'Usuário'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user.phone}
                  </p>
                </div>

                {/* Indicador online */}
                <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0"></div>
              </div>

              {/* Botão chat */}
              <button
                onClick={() => onSelectUser(user.phone)}
                className="ml-2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition"
                title="Enviar mensagem"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer com contador */}
      {!isExpanded && (
        <div className="p-3 text-center text-sm text-gray-600 bg-gray-50">
          {otherUsers.length} usuário{otherUsers.length !== 1 ? 's' : ''} disponível{otherUsers.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
