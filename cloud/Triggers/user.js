Parse.Cloud.beforeSave(Parse.User, async (request) => {
    const user = request.object;
  
    if (!user.isNew()) return;
  
    const userParentId = user.get("userParentId");
    const userParentName = user.get("userParentName");
  
    if (!userParentId || !userParentName) {
      throw new Parse.Error(400, "Missing userParentId or userParentName.");
    }
  
    const parentQuery = new Parse.Query(Parse.User);
    parentQuery.equalTo("objectId", userParentId);
    parentQuery.equalTo("username", userParentName);
    const parentUser = await parentQuery.first({ useMasterKey: true });
  
    if (!parentUser) {
      throw new Parse.Error(404, "Parent user not found or mismatch between userParentId and userParentName.");
    }
 });
  