'use babel';
'use strict';

var Q = require('q'),
    _private = require('../util/private-store').create();

class UserService {
  constructor (revConnection) {
    var $resource = revConnection.resource;

    // store private variablese
    _private(this, {
      rev: revConnection,
      dispatchCommand: revConnection.dispatchCommand,
      userConfirmationResource: $resource('/network/users/confirm/:token'),
      userResource: $resource('/network/users/:userId'),
      passwordResource: $resource('/network/users/reset/:token'),
      authorizationResource: $resource('/authorization'),
      sessionResource: $resource('/session'),
      confirmationTokenResource: $resource('/network/users/:userId/confirmation'),
      passwordResetTokenResource: $resource('/network/users/:userId/reset-token')
    });


  }
  //Authenticate user with the user's credentials. returns a promise that will resolve with the users auth token.
  authenticateUser (username, password) {
    let data = { username: username, password: password },
        finalEvents = ["LoggedOn", "LogOnFailed", "LogOnFailedMaintenance"];
    return _private(this).dispatchCommand("network:LogOn", data, finalEvents)
      .then( (result) => {
        if (result.eventType === 'LoggedOn') {
          return result.message;
        }
        else if (result.eventType === 'LogOnFailed') {
          return Q.reject('LogOnFailed');
        }
        else if (result.eventType === 'LogOnFailedMaintenance') {
          return Q.reject('LogOnFailedMaintenance');
        }
        else {
          return Q.reject();
        }
      }, (result) => {
        if(result) {
          if (result.hasIssue('LockedOut')) {
            return Q.reject('LockedOut');
          }
          else if (result.hasIssue('NotActive')) {
            return Q.reject('NotActive');
          }
        }
        return Q.reject(result);
      });
  }
  //Session keep alive api.
  extendSessionTimeout (userId) {
    return _private(this).dispatchCommand("network:ExtendSessionTimeout", {
      userId: userId
    });
  }

  confirmUser (userConfirmation) {
    return _private(this).dispatchCommand("network:ConfirmUser", {
      userId: userConfirmation.userId,
      token: userConfirmation.token,
      password: userConfirmation.password,
      securityQuestion: userConfirmation.securityQuestion,
      securityAnswer: userConfirmation.securityAnswer
    });
  }

  /**
    Logs out the currently active user
    returns promise object
  **/
  doLogout (userId) {
    return _private(this).dispatchCommand("network:LogOff", {
        userId:userId
      });
  }

  getUserConfirmation (token) {
    return _private(this).userConfirmationResource.get({ token: token })
      .then( (data) => {
        return {
          userId: data.userId,
          accountId: data.accountId,
          username: data.username
        };
      });
  }

  getConfirmationToken (userId) {
    return _private(this).confirmationTokenResource.get({ userId: userId })
      .then( (data) => data.token);
  }

  getUserStatus (userId) {
    return _private(this).userResource.get({userId: userId})
      .then( (data) => data.itemStatus);
  }

  getUserDetail (userId) {
    return _private(this).userResource.get({userId: userId})
      .then( (user) => {
        user.id = userId;
        user.address = user.address || {};
        user.roleIds = user.roleIds || [];
        user.groupIds = user.groupIds || [];
        return user;
      });
  }

  getUserByUsername (username) {
    if (!username) return Q.reject('Invalid Username');
    username = username.replace(/['"\/\\\(\)]/g, '');
    return _private(this).rev.search.getUsers({
      query: `Username:"${username}"`,
      count: 1
    }).then( (result) => result.users[0]);
  }

  getUserByEmail (email) {
    if (!email) return Q.reject('Invalid Email');
    email = email.replace(/['"\/\\\(\)]/g, '');
    return _private(this).rev.search.getUsers({
      query: `Email:"${email}"`,
      count: 1
    }).then( (result) => result.users[0]);
  }

  getAccountId (userId) {
    return _private(this).userResource.get({userId: userId})
      .then( (data) => data.accountId);
  }

  getAuthorization () {
    return _private(this).authorizationResource.get()
      .then( (result) => result.authorizationKeys);
  }

  requestPasswordReset (username) {
    return _private(this).dispatchCommand("network:RequestPasswordReset", { username: username });
  }

  requestPasswordResetAdmin(accountId, username) {
    if (accountId && !username) {
      username = accountId;
      accountId = _private(this).rev.accountId;
    }
    return _private(this).dispatchCommand("network:AdminRequestPasswordReset", {
      accountId: accountId,
      username: username
    });
  }


  getUserPasswordReset (token) {
    return _private(this).passwordResetResource.get({token: token});
  }

  getPasswordResetToken (userId) {
    return _private(this).passwordResetTokenResource.get({userId: userId})
      .then( (data) => data.token );
  }

  resetPassword (passwordReset) {
    let data = {
          token: passwordReset.token,
          userId: passwordReset.userId,
          securityAnswer: passwordReset.securityAnswer,
          password: passwordReset.password
        };
    return _private(this).dispatchCommand("network:ResetPassword", data)
      .then( (result) => {
        if (result.type === 'PasswordResetFailed') {
          return Q.reject('PasswordResetFailed');
        }
        return result;
      });
  }

  checkSessionHealth () {
    return _private(this).sessionResource.get();
  }

  create (user) {
    var address = user.address || {};
    return _private(this).dispatchCommand("network:RegisterUser", {
        accountId: user.accountId,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        title: user.title,
        phone: user.phone,
        address: {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          countryCode: address.countryCode,
          postalCode: address.postalCode
        },
        language: user.language,
        roleIds: user.roleIds,
        groupIds: user.groupIds
      }, ['UserCreated'])
    .then( (result) => result.message );
  }

  modify (user) {
    var address = user.address || {};
    return _private(this).dispatchCommand("network:SaveUserDetails", {
        userId: user.id,
        accountId: user.accountId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        title: user.title,
        phone: user.phone,
        address: {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          countryCode: address.countryCode,
          postalCode: address.postalCode
        },
        language: user.language,
        roleIds: user.roleIds,
        groupIds: user.groupIds
      });
  }

  suspend (accountId, userId) {
    return _private(this).dispatchCommand("network:SuspendUser", {
      accountId: accountId,
      userId: userId
    });
  }

  unsuspend (accountId, userId) {
    return _private(this).dispatchCommand("network:UnsuspendUser", {
      accountId: accountId,
      userId: userId
    });
  }

  unlock (accountId, userId) {
    return _private(this).dispatchCommand("network:UnlockUser", {
      accountId: accountId,
      userId: userId
    });
  }

  reset (accountId, userId) {
    return _private(this).dispatchCommand("network:ResetUser", {
      accountId: accountId,
      userId: userId
    });
  }

  delete (accountId, userId) {
    return _private(this).dispatchCommand("network:DeleteUser", {
      accountId: accountId,
      userId: userId
    });
  }

}

module.exports = UserService;
